/**
 * Vertical Slice — campaign-launch loop, end to end:
 * import → validate → baseline → diagnose → propose → approve → version
 * → execute/track → outcomes → compare → (evidence for next proposal).
 *
 * All routes are tenant-scoped, permission-checked at the backend, and
 * audited with the P10 hash-chained audit log.
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { importTaskEvents } from '@ghal/ingestion';
import { computeBaseline } from '@ghal/metrics';
import { detectFindings } from '@ghal/diagnostics';
import { generateProposals, compileProposal, irFromObservedSteps, validateProposal } from '@ghal/redesign';
import { compareWithBaseline } from '@ghal/outcomes';
import { AuditWriter } from '@ghal/audit';
import {
  JsonFileStore,
  serializeEvent,
  reviveEvent,
  type Permission,
} from './store/json-file-store.js';

export interface VerticalSliceDeps {
  store: JsonFileStore;
}

const CreateProcess = z.object({ name: z.string().min(1), description: z.string().optional() });
const ImportCsv = z.object({ csv: z.string().min(1), label: z.string().optional() });
const OpenCase = z.object({ process_version_id: z.string(), external_ref: z.string().optional() });
const CaseEvent = z.object({
  step_id: z.string().min(1),
  action: z.string().min(1),
  payload: z.record(z.unknown()).default({}),
});
const Rollback = z.object({ to_version: z.number().int().min(1), reason: z.string().min(1) });

export function createVerticalSliceApp(deps: VerticalSliceDeps) {
  const { store } = deps;
  const audit = new AuditWriter(store);
  const app = new Hono<{ Variables: { tenant: string; user: string } }>();

  // Auth context: headers identify tenant + user; user must exist in the store.
  app.use('*', async (c, next) => {
    const tenant = c.req.header('x-tenant-id');
    const user = c.req.header('x-user-id');
    if (!tenant || !user) return c.json({ error: 'missing x-tenant-id / x-user-id' }, 401);
    if (!store.getUser(tenant, user)) return c.json({ error: 'unknown user for tenant' }, 403);
    c.set('tenant', tenant);
    c.set('user', user);
    await next();
  });

  const permit = (p: Permission) => {
    return async (c: any, next: () => Promise<void>) => {
      const perms = store.permissionsFor(c.get('tenant'), c.get('user'));
      if (!perms.has(p)) {
        await audit.append({
          tenantId: c.get('tenant'),
          actorId: c.get('user'),
          action: 'permission.denied',
          objectType: 'permission',
          payload: { required: p, path: c.req.path },
        });
        return c.json({ error: `permission denied: requires "${p}"` }, 403);
      }
      await next();
    };
  };

  // --- Process creation ---
  app.post('/processes', permit('propose'), async (c) => {
    const tenant = c.get('tenant');
    const user = c.get('user');
    const body = CreateProcess.parse(await c.req.json());
    const p = {
      id: randomUUID(),
      tenant_id: tenant,
      name: body.name,
      description: body.description ?? null,
      status: 'draft' as const,
      created_by: user,
      created_at: new Date().toISOString(),
    };
    store.insertProcess(p);
    await audit.append({ tenantId: tenant, actorId: user, action: 'process.created', objectType: 'process', objectId: p.id, payload: { name: p.name } });
    return c.json(p, 201);
  });

  app.get('/processes', permit('view'), async (c) => c.json(store.listProcesses(c.get('tenant'))));

  // --- Import + validation (Module C) ---
  app.post('/processes/:id/import', permit('propose'), async (c) => {
    const tenant = c.get('tenant');
    const user = c.get('user');
    const proc = store.getProcess(tenant, c.req.param('id'));
    if (!proc) return c.json({ error: 'process not found' }, 404);
    const body = ImportCsv.parse(await c.req.json());
    const result = importTaskEvents(body.csv);
    store.putEvents(tenant, proc.id, result.events.map(serializeEvent));

    // Compile the observed current operating model as draft IR v1 (once).
    let version = null;
    if (store.listVersions(tenant, proc.id).length === 0 && result.events.length > 0) {
      const seen = new Map<string, { localId: string; taskName: string; ownerRole: string; dependsOn: string | null; requiresApproval: boolean }>();
      for (const e of result.events) {
        if (!seen.has(e.localId)) {
          seen.set(e.localId, {
            localId: e.localId,
            taskName: e.taskName,
            ownerRole: e.ownerRole,
            dependsOn: e.dependsOn,
            requiresApproval: e.approvalStatus !== null,
          });
        }
      }
      const ir = irFromObservedSteps(proc.id, [...seen.values()]);
      version = {
        id: randomUUID(),
        tenant_id: tenant,
        process_id: proc.id,
        version: 1,
        status: 'draft' as const,
        ir,
        change_reason: `compiled from imported event data${body.label ? ` (${body.label})` : ''}`,
        proposal_id: null,
        created_by: user,
        created_at: new Date().toISOString(),
      };
      store.insertVersion(version);
    }

    await audit.append({
      tenantId: tenant,
      actorId: user,
      action: 'events.imported',
      objectType: 'process',
      objectId: proc.id,
      payload: { rows: result.events.length, issues: result.issues.length, caseCount: result.caseCount },
    });
    return c.json({ imported: result.events.length, caseCount: result.caseCount, issues: result.issues, capabilities: result.capabilities, draftVersion: version }, 201);
  });

  // --- Baseline metrics (Module C/E) ---
  app.post('/processes/:id/baseline', permit('view'), async (c) => {
    const tenant = c.get('tenant');
    const proc = store.getProcess(tenant, c.req.param('id'));
    if (!proc) return c.json({ error: 'process not found' }, 404);
    const events = store.getEvents(tenant, proc.id).map(reviveEvent);
    if (events.length === 0) return c.json({ error: 'no imported events — import data first' }, 400);
    const baseline = computeBaseline(events);
    store.putBaseline(tenant, proc.id, baseline);
    await audit.append({ tenantId: tenant, actorId: c.get('user'), action: 'baseline.computed', objectType: 'process', objectId: proc.id, payload: { caseCount: baseline.caseCount } });
    return c.json(baseline);
  });

  app.get('/processes/:id/baseline', permit('view'), async (c) => {
    const b = store.getBaseline(c.get('tenant'), c.req.param('id'));
    if (!b) return c.json({ error: 'no baseline computed' }, 404);
    return c.json(b);
  });

  // --- Diagnostics (Module C) ---
  app.post('/processes/:id/diagnostics', permit('view'), async (c) => {
    const tenant = c.get('tenant');
    const proc = store.getProcess(tenant, c.req.param('id'));
    if (!proc) return c.json({ error: 'process not found' }, 404);
    const baseline = store.getBaseline(tenant, proc.id);
    if (!baseline) return c.json({ error: 'compute baseline first' }, 400);
    const events = store.getEvents(tenant, proc.id).map(reviveEvent);
    const findings = detectFindings(events, baseline);
    store.putFindings(tenant, proc.id, findings);
    await audit.append({ tenantId: tenant, actorId: c.get('user'), action: 'diagnostics.run', objectType: 'process', objectId: proc.id, payload: { findings: findings.map((f) => f.type) } });
    return c.json(findings);
  });

  app.get('/processes/:id/diagnostics', permit('view'), async (c) => c.json(store.getFindings(c.get('tenant'), c.req.param('id'))));

  // --- Proposals (Module D) ---
  app.post('/processes/:id/proposals', permit('propose'), async (c) => {
    const tenant = c.get('tenant');
    const proc = store.getProcess(tenant, c.req.param('id'));
    if (!proc) return c.json({ error: 'process not found' }, 404);
    const baseline = store.getBaseline(tenant, proc.id);
    const findings = store.getFindings(tenant, proc.id);
    const versions = store.listVersions(tenant, proc.id);
    if (!baseline || versions.length === 0) return c.json({ error: 'need baseline and a compiled version first' }, 400);
    const current = versions[versions.length - 1]!;
    const proposals = generateProposals(current.ir, findings, baseline);
    for (const p of proposals) {
      const errs = validateProposal(p);
      if (errs.length > 0) return c.json({ error: 'generated proposal failed schema validation', details: errs }, 500);
      store.insertProposal(tenant, p);
    }
    await audit.append({ tenantId: tenant, actorId: c.get('user'), action: 'proposals.generated', objectType: 'process', objectId: proc.id, payload: { count: proposals.length, ids: proposals.map((p) => p.id) } });
    return c.json(proposals, 201);
  });

  app.get('/processes/:id/proposals', permit('view'), async (c) => c.json(store.listProposals(c.get('tenant'), c.req.param('id'))));

  // --- Approval → new version (Modules D/E/F/G) ---
  app.post('/proposals/:id/approve', permit('approve'), async (c) => {
    const tenant = c.get('tenant');
    const user = c.get('user');
    const proposal = store.getProposal(tenant, c.req.param('id'));
    if (!proposal) return c.json({ error: 'proposal not found' }, 404);
    if (proposal.status !== 'draft') return c.json({ error: `proposal already ${proposal.status}` }, 409);
    const versions = store.listVersions(tenant, proposal.processId);
    const current = versions[versions.length - 1]!;
    const ir = compileProposal(current.ir, proposal);
    const v = {
      id: randomUUID(),
      tenant_id: tenant,
      process_id: proposal.processId,
      version: ir.version,
      status: 'active' as const,
      ir,
      change_reason: `approved proposal: ${proposal.title}`,
      proposal_id: proposal.id,
      created_by: user,
      created_at: new Date().toISOString(),
    };
    store.updateVersionStatus(tenant, current.id, 'archived');
    store.insertVersion(v);
    store.updateProposalStatus(tenant, proposal.id, 'approved');
    await audit.append({ tenantId: tenant, actorId: user, action: 'proposal.approved', objectType: 'process_version', objectId: v.id, payload: { proposalId: proposal.id, version: v.version } });
    return c.json(v, 201);
  });

  app.post('/proposals/:id/reject', permit('approve'), async (c) => {
    const tenant = c.get('tenant');
    const proposal = store.getProposal(tenant, c.req.param('id'));
    if (!proposal) return c.json({ error: 'proposal not found' }, 404);
    if (proposal.status !== 'draft') return c.json({ error: `proposal already ${proposal.status}` }, 409);
    store.updateProposalStatus(tenant, proposal.id, 'rejected');
    await audit.append({ tenantId: tenant, actorId: c.get('user'), action: 'proposal.rejected', objectType: 'proposal', objectId: proposal.id });
    return c.json({ id: proposal.id, status: 'rejected' });
  });

  // --- Version history + rollback (Module H) ---
  app.get('/processes/:id/versions', permit('view'), async (c) => {
    const tenant = c.get('tenant');
    return c.json(
      store.listVersions(tenant, c.req.param('id')).map((v) => ({
        id: v.id, version: v.version, status: v.status, change_reason: v.change_reason, proposal_id: v.proposal_id, created_by: v.created_by, created_at: v.created_at,
      })),
    );
  });

  app.post('/processes/:id/rollback', permit('approve'), async (c) => {
    const tenant = c.get('tenant');
    const user = c.get('user');
    const proc = store.getProcess(tenant, c.req.param('id'));
    if (!proc) return c.json({ error: 'process not found' }, 404);
    const body = Rollback.parse(await c.req.json());
    const versions = store.listVersions(tenant, proc.id);
    const target = versions.find((v) => v.version === body.to_version);
    if (!target) return c.json({ error: `version ${body.to_version} not found` }, 404);
    const latest = versions[versions.length - 1]!;
    // Rollback creates a NEW version copying the target IR — history is never rewritten.
    const ir = JSON.parse(JSON.stringify(target.ir)) as typeof target.ir;
    ir.version = latest.version + 1;
    const v = {
      id: randomUUID(),
      tenant_id: tenant,
      process_id: proc.id,
      version: ir.version,
      status: 'active' as const,
      ir,
      change_reason: `rollback to v${body.to_version}: ${body.reason}`,
      proposal_id: null,
      created_by: user,
      created_at: new Date().toISOString(),
    };
    store.updateVersionStatus(tenant, latest.id, 'archived');
    store.insertVersion(v);
    await audit.append({ tenantId: tenant, actorId: user, action: 'process.rollback', objectType: 'process_version', objectId: v.id, payload: { toVersion: body.to_version, newVersion: v.version, reason: body.reason } });
    return c.json(v, 201);
  });

  // --- Runtime tracking (Module F, human-confirmed execution) ---
  app.post('/cases', permit('execute'), async (c) => {
    const tenant = c.get('tenant');
    const user = c.get('user');
    const body = OpenCase.parse(await c.req.json());
    const version = store.getVersion(tenant, body.process_version_id);
    if (!version) return c.json({ error: 'process version not found' }, 404);
    if (version.status !== 'active' && version.status !== 'approved') {
      return c.json({ error: `cannot open case on ${version.status} version` }, 409);
    }
    const kase = {
      id: randomUUID(),
      tenant_id: tenant,
      process_version_id: version.id,
      external_ref: body.external_ref ?? null,
      status: 'open' as const,
      created_by: user,
      created_at: new Date().toISOString(),
    };
    store.insertCase(kase);
    await audit.append({ tenantId: tenant, actorId: user, action: 'case.opened', objectType: 'case', objectId: kase.id, payload: { processVersionId: version.id, version: version.version } });
    return c.json(kase, 201);
  });

  app.post('/cases/:id/events', permit('execute'), async (c) => {
    const tenant = c.get('tenant');
    const user = c.get('user');
    const kase = store.getCase(tenant, c.req.param('id'));
    if (!kase) return c.json({ error: 'case not found' }, 404);
    const body = CaseEvent.parse(await c.req.json());
    const version = store.getVersion(tenant, kase.process_version_id)!;
    const knownStep = version.ir.modules.some((m) => m.steps.some((s) => s.id === body.step_id));
    if (!knownStep) return c.json({ error: `step "${body.step_id}" not in pinned process version ${version.version}` }, 400);
    const ev = {
      id: randomUUID(),
      tenant_id: tenant,
      case_id: kase.id,
      step_id: body.step_id,
      action: body.action,
      payload: body.payload,
      actor_id: user,
      created_at: new Date().toISOString(),
    };
    store.addCaseEvent(ev);
    await audit.append({ tenantId: tenant, actorId: user, action: `case.event.${body.action}`, objectType: 'case', objectId: kase.id, payload: { stepId: body.step_id } });
    return c.json(ev, 201);
  });

  app.get('/cases/:id', permit('view'), async (c) => {
    const tenant = c.get('tenant');
    const kase = store.getCase(tenant, c.req.param('id'));
    if (!kase) return c.json({ error: 'case not found' }, 404);
    return c.json({ ...kase, events: store.listCaseEvents(tenant, kase.id) });
  });

  // --- Outcomes (Module E) ---
  app.post('/processes/:id/outcomes', permit('execute'), async (c) => {
    const tenant = c.get('tenant');
    const user = c.get('user');
    const proc = store.getProcess(tenant, c.req.param('id'));
    if (!proc) return c.json({ error: 'process not found' }, 404);
    const body = ImportCsv.parse(await c.req.json());
    const result = importTaskEvents(body.csv);
    store.putOutcomes(tenant, proc.id, result.events.map(serializeEvent));
    await audit.append({ tenantId: tenant, actorId: user, action: 'outcomes.imported', objectType: 'process', objectId: proc.id, payload: { rows: result.events.length, issues: result.issues.length } });
    return c.json({ imported: result.events.length, caseCount: result.caseCount, issues: result.issues }, 201);
  });

  app.get('/processes/:id/comparison', permit('view'), async (c) => {
    const tenant = c.get('tenant');
    const baseline = store.getBaseline(tenant, c.req.param('id'));
    if (!baseline) return c.json({ error: 'no baseline computed' }, 404);
    const outcomes = store.getOutcomes(tenant, c.req.param('id')).map(reviveEvent);
    if (outcomes.length === 0) return c.json({ error: 'no outcome data imported' }, 404);
    return c.json(compareWithBaseline(baseline, outcomes));
  });

  // --- Audit trail (Module G) ---
  app.get('/audit', permit('view'), async (c) => c.json(store.listAudit(c.get('tenant'))));

  return app;
}
