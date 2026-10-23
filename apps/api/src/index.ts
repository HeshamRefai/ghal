import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { AuditWriter } from '@ghal/audit';
import { evaluate } from '@ghal/governance';
import { validateIR } from '@ghal/process-ir';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const auditStore = {
  async lastHash(tenantId: string) {
    const { data } = await supabase.from('audit_events').select('hash')
      .eq('tenant_id', tenantId).order('seq', { ascending: false }).limit(1).maybeSingle();
    return data?.hash ?? null;
  },
  async insert(rec: any) {
    const { error } = await supabase.from('audit_events').insert({
      tenant_id: rec.tenantId, actor_id: rec.actorId ?? null, action: rec.action,
      object_type: rec.objectType, object_id: rec.objectId ?? null,
      payload: rec.payload ?? {}, prev_hash: rec.prevHash, hash: rec.hash,
    });
    if (error) throw new Error(`audit insert failed: ${error.message}`);
  },
};
const audit = new AuditWriter(auditStore);

const app = new Hono<{ Variables: { tenant: string; user: string } }>();

app.use('*', async (c, next) => {
  const tenant = c.req.header('x-tenant-id');
  const user = c.req.header('x-user-id');
  if (!tenant || !user) return c.json({ error: 'missing x-tenant-id / x-user-id' }, 401);
  await supabase.rpc('set_config', { setting: 'app.tenant', value: tenant }).then(() => {}, () => {});
  c.set('tenant', tenant); c.set('user', user);
  await next();
});

const CreateProcess = z.object({ name: z.string().min(1), description: z.string().optional() });
const CreateCase = z.object({ process_version_id: z.string().uuid(), external_ref: z.string().optional() });
const RecordDecision = z.object({
  case_id: z.string().uuid(), step_id: z.string(),
  what: z.string().min(1), why: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  policy_id: z.string().uuid().optional(), evidence: z.array(z.unknown()).default([]),
});
const RaiseException = z.object({
  case_id: z.string().uuid(), step_id: z.string(),
  type: z.string().min(1),
});

app.post('/processes', async (c) => {
  const tenant = c.get('tenant');
  const body = CreateProcess.parse(await c.req.json());
  const { data, error } = await supabase.from('processes')
    .insert({ tenant_id: tenant, name: body.name, description: body.description, created_by: c.get('user') })
    .select().single();
  if (error) return c.json({ error: error.message }, 400);
  await audit.append({ tenantId: tenant, action: 'process.created', objectType: 'process', objectId: data.id });
  return c.json(data, 201);
});

app.get('/processes', async (c) => {
  // Tenant filter is mandatory: the service-role key bypasses RLS, so
  // organization isolation is enforced explicitly in every query.
  const { data, error } = await supabase.from('processes').select('*, process_versions(id, version, status)')
    .eq('tenant_id', c.get('tenant'));
  if (error) return c.json({ error: error.message }, 400);
  return c.json(data);
});

app.post('/processes/:id/versions', async (c) => {
  const tenant = c.get('tenant');
  const ir = (await c.req.json()) as any;
  const errors = validateIR(ir);
  if (errors.length) return c.json({ error: 'invalid IR', details: errors }, 422);
  const { data: last } = await supabase.from('process_versions')
    .select('version').eq('process_id', c.req.param('id')).order('version', { ascending: false }).limit(1).maybeSingle();
  const version = (last?.version ?? 0) + 1;
  const { data, error } = await supabase.from('process_versions')
    .insert({ tenant_id: tenant, process_id: c.req.param('id'), version, ir, status: 'draft' })
    .select().single();
  if (error) return c.json({ error: error.message }, 400);
  await audit.append({ tenantId: tenant, action: 'version.created', objectType: 'process_version', objectId: data.id, payload: { version } });
  return c.json(data, 201);
});

app.get('/processes/:id/versions', async (c) => {
  const { data, error } = await supabase.from('process_versions')
    .select('id, version, status, change_reason, created_at').eq('tenant_id', c.get('tenant')).eq('process_id', c.req.param('id')).order('version');
  if (error) return c.json({ error: error.message }, 400);
  return c.json(data);
});

app.post('/cases', async (c) => {
  const tenant = c.get('tenant');
  const body = CreateCase.parse(await c.req.json());
  const { data, error } = await supabase.from('cases')
    .insert({ tenant_id: tenant, process_version_id: body.process_version_id, external_ref: body.external_ref })
    .select().single();
  if (error) return c.json({ error: error.message }, 400);
  await audit.append({ tenantId: tenant, action: 'case.opened', objectType: 'case', objectId: data.id });
  return c.json(data, 201);
});

app.get('/cases/:id', async (c) => {
  const { data, error } = await supabase.from('cases')
    .select('*, events(*)').eq('tenant_id', c.get('tenant')).eq('id', c.req.param('id')).single();
  if (error) return c.json({ error: error.message }, 404);
  return c.json(data);
});

app.post('/decisions', async (c) => {
  const tenant = c.get('tenant');
  const body = RecordDecision.parse(await c.req.json());
  const { data: policy } = await supabase.from('policies').select('*')
    .eq('tenant_id', tenant).eq('active', true).eq('id', body.policy_id ?? '').maybeSingle();
  if (policy) {
    const r = evaluate(policy as any, body as any);
    if (r.decision === 'DENY') {
      await audit.append({ tenantId: tenant, action: 'policy.denied', objectType: 'decision', payload: { reason: r.reason } });
      return c.json({ error: 'denied by policy', reason: r.reason }, 403);
    }
  }
  const { data, error } = await supabase.from('decisions')
    .insert({
      tenant_id: tenant, case_id: body.case_id, step_id: body.step_id,
      actor_id: c.get('user'), what: body.what, why: body.why,
      confidence: body.confidence, policy_id: body.policy_id, evidence: body.evidence,
    }).select().single();
  if (error) return c.json({ error: error.message }, 400);
  await audit.append({ tenantId: tenant, action: 'decision.recorded', objectType: 'decision', objectId: data.id });
  return c.json(data, 201);
});

app.post('/exceptions', async (c) => {
  const tenant = c.get('tenant');
  const body = RaiseException.parse(await c.req.json());
  const { data, error } = await supabase.from('exceptions')
    .insert({ tenant_id: tenant, case_id: body.case_id, step_id: body.step_id, type: body.type })
    .select().single();
  if (error) return c.json({ error: error.message }, 400);
  await audit.append({ tenantId: tenant, action: 'exception.raised', objectType: 'exception', objectId: data.id, payload: { type: body.type } });
  return c.json(data, 201);
});

app.get('/exceptions', async (c) => {
  const { data, error } = await supabase.from('exceptions').select('*')
    .eq('tenant_id', c.get('tenant'))
    .order('created_at', { ascending: false }).limit(100);
  if (error) return c.json({ error: error.message }, 400);
  return c.json(data);
});

app.get('/audit-events', async (c) => {
  const { data, error } = await supabase.from('audit_events').select('*')
    .eq('tenant_id', c.get('tenant'))
    .order('seq', { ascending: false }).limit(200);
  if (error) return c.json({ error: error.message }, 400);
  return c.json(data);
});

// Only start listening when run directly (importable for tests/dev composition).
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 8787);
  serve({ fetch: app.fetch, port });
  console.log(`G-HAL API on :${port}`);
}

export default app;
