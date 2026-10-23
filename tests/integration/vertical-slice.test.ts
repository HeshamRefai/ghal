/**
 * Integration test — the complete vertical slice through the HTTP API:
 * create workspace process → import → validate → baseline → diagnose
 * → propose → (permission checks) → approve → new version → execute/track
 * → outcomes → compare → rollback → audit chain verification.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createVerticalSliceApp } from '../../apps/api/src/vertical-slice';
import { JsonFileStore } from '../../apps/api/src/store/json-file-store';
import { AuditWriter } from '@ghal/audit';

const TENANT = '11111111-1111-1111-1111-111111111111';
const OTHER_TENANT = '99999999-9999-9999-9999-999999999999';
const ADMIN = 'aaaaaaaa-0000-0000-0000-000000000001';
const MANAGER = 'aaaaaaaa-0000-0000-0000-000000000002';
const OPERATOR = 'aaaaaaaa-0000-0000-0000-000000000003';

const CSV = readFileSync('tests/fixtures/campaign-launch.csv', 'utf8');
const OUTCOME_CSV = readFileSync('tests/fixtures/campaign-launch-outcomes.csv', 'utf8');

let app: ReturnType<typeof createVerticalSliceApp>;
let store: JsonFileStore;

const req = (path: string, opts: RequestInit & { user?: string; tenant?: string } = {}) => {
  const { user = ADMIN, tenant = TENANT, ...init } = opts;
  return app.request(path, {
    ...init,
    headers: { 'content-type': 'application/json', 'x-tenant-id': tenant, 'x-user-id': user, ...(init.headers ?? {}) },
  });
};
const post = (path: string, body: unknown, opts: Parameters<typeof req>[1] = {}) =>
  req(path, { method: 'POST', body: JSON.stringify(body), ...opts });

beforeAll(() => {
  store = new JsonFileStore(mkdtempSync(join(tmpdir(), 'ghal-test-')));
  store.upsertUser(TENANT, { id: ADMIN, email: 'admin@agency.test', name: 'Admin', roles: ['admin'] });
  store.upsertUser(TENANT, { id: MANAGER, email: 'manager@agency.test', name: 'Manager', roles: ['manager'] });
  store.upsertUser(TENANT, { id: OPERATOR, email: 'operator@agency.test', name: 'Operator', roles: ['operator'] });
  // Same user id exists in another tenant to prove isolation
  store.upsertUser(OTHER_TENANT, { id: ADMIN, email: 'admin@other.test', name: 'Other Admin', roles: ['admin'] });
  app = createVerticalSliceApp({ store });
});

describe('auth and permissions', () => {
  it('rejects missing headers with 401', async () => {
    const res = await app.request('/processes');
    expect(res.status).toBe(401);
  });

  it('rejects unknown users with 403', async () => {
    const res = await req('/processes', { user: '00000000-0000-0000-0000-000000000000' });
    expect(res.status).toBe(403);
  });
});

describe('vertical slice end to end', () => {
  let processId: string;
  let proposalId: string;
  let activeVersionId: string;
  let caseId: string;

  it('1. creates a campaign-launch process', async () => {
    const res = await post('/processes', { name: 'Campaign launch', description: 'Brief → approved live campaign' });
    expect(res.status).toBe(201);
    processId = ((await res.json()) as any).id;
  });

  it('2. imports and validates event data; compiles observed IR v1', async () => {
    const res = await post(`/processes/${processId}/import`, { csv: CSV, label: 'Sept–Oct campaigns' });
    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.imported).toBe(42);
    expect(body.caseCount).toBe(6);
    expect(body.issues).toEqual([]);
    expect(body.capabilities.cycleTime).toBe(true);
    expect(body.draftVersion.version).toBe(1);
    expect(body.draftVersion.status).toBe('draft');
  });

  it('3. computes baseline metrics from the data', async () => {
    const res = await post(`/processes/${processId}/baseline`, {});
    expect(res.status).toBe(200);
    const b = (await res.json()) as any;
    expect(b.caseCount).toBe(6);
    const avg = b.metrics.find((m: any) => m.name === 'avg_cycle_time_hours');
    expect(avg.value).toBeCloseTo(736 / 6, 3);
    expect(avg.kind).toBe('calculated');
  });

  it('4. diagnoses the approval bottleneck with evidence', async () => {
    const res = await post(`/processes/${processId}/diagnostics`, {});
    const findings = (await res.json()) as any;
    const approval = findings.find((f: any) => f.type === 'approval_bottleneck');
    expect(approval).toBeDefined();
    expect(approval.evidence.caseIds.length).toBe(5);
  });

  it('5. generates structured proposals', async () => {
    const res = await post(`/processes/${processId}/proposals`, {});
    expect(res.status).toBe(201);
    const proposals = (await res.json()) as any;
    expect(proposals.length).toBeGreaterThanOrEqual(2);
    proposalId = proposals.find((p: any) => p.kind === 'conservative' && p.id.includes('approval')).id;
  });

  it('6. an operator cannot approve (permission enforced at backend)', async () => {
    const res = await post(`/proposals/${proposalId}/approve`, {}, { user: OPERATOR });
    expect(res.status).toBe(403);
  });

  it('7. a manager approves → new active process version v2', async () => {
    const res = await post(`/proposals/${proposalId}/approve`, {}, { user: MANAGER });
    expect(res.status).toBe(201);
    const v = (await res.json()) as any;
    expect(v.version).toBe(2);
    expect(v.status).toBe('active');
    activeVersionId = v.id;
    const step = v.ir.modules.flatMap((m: any) => m.steps).find((s: any) => s.id === 'client_approval');
    expect(step.parameters.sla_hours).toBe(24);
    expect(step.autonomy).toBe('APPROVAL_REQUIRED');
  });

  it('8. opens a case on the active version and records execution events', async () => {
    const open = await post('/cases', { process_version_id: activeVersionId, external_ref: 'CAMP-101' }, { user: OPERATOR });
    expect(open.status).toBe(201);
    caseId = ((await open.json()) as any).id;

    const ev = await post(`/cases/${caseId}/events`, { step_id: 'brief_intake', action: 'completed', payload: { note: 'brief received' } }, { user: OPERATOR });
    expect(ev.status).toBe(201);

    const bad = await post(`/cases/${caseId}/events`, { step_id: 'no_such_step', action: 'completed' }, { user: OPERATOR });
    expect(bad.status).toBe(400); // step must exist in the pinned version

    const detail = await req(`/cases/${caseId}`);
    expect(((await detail.json()) as any).events).toHaveLength(1);
  });

  it('9. imports outcomes and compares with baseline (measured, non-causal)', async () => {
    const imp = await post(`/processes/${processId}/outcomes`, { csv: OUTCOME_CSV }, { user: OPERATOR });
    expect(imp.status).toBe(201);
    const res = await req(`/processes/${processId}/comparison`);
    const cmp = (await res.json()) as any;
    const cycle = cmp.comparisons.find((c: any) => c.metric === 'avg_cycle_time_hours');
    expect(cycle.direction).toBe('improved');
    expect(cmp.confounders.length).toBeGreaterThan(0);
  });

  it('10. rollback creates a new version, preserving history', async () => {
    const res = await post(`/processes/${processId}/rollback`, { to_version: 1, reason: 'SLA caused escalation fatigue' }, { user: MANAGER });
    expect(res.status).toBe(201);
    const v3 = (await res.json()) as any;
    expect(v3.version).toBe(3);
    expect(v3.change_reason).toContain('rollback to v1');

    const versions = (await (await req(`/processes/${processId}/versions`)).json()) as any;
    expect(versions.map((v: any) => v.version)).toEqual([1, 2, 3]);
    expect(versions.find((v: any) => v.version === 2).status).toBe('archived');
  });

  it('11. audit chain is complete and verifiable', async () => {
    const records = store.listAudit(TENANT);
    expect(records.length).toBeGreaterThanOrEqual(8);
    const writer = new AuditWriter(store);
    const ok = await writer.verifyChain(
      records.map((r) => (<any>{
        tenantId: r.tenant_id,
        actorId: r.actor_id ?? undefined,
        action: r.action,
        objectType: r.object_type,
        objectId: r.object_id ?? undefined,
        payload: r.payload,
        prevHash: r.prev_hash,
        hash: r.hash,
      })),
    );
    expect(ok).toBe(true);
    // permission.denied was audited too
    expect(records.some((r) => r.action === 'permission.denied')).toBe(true);
  });
});

describe('tenant isolation', () => {
  it('another tenant cannot see or touch this tenant’s processes', async () => {
    const list = await (await req('/processes', { tenant: OTHER_TENANT })).json();
    expect(list).toEqual([]);
    const res = await post(`/processes/${'does-not-matter'}/baseline`, {}, { tenant: OTHER_TENANT });
    expect(res.status).toBe(404);
  });
});
