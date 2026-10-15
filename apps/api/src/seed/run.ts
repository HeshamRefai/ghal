import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const ir = JSON.parse(readFileSync(new URL('./invoice-ir.json', import.meta.url), 'utf8'));

const ORG = '11111111-1111-1111-1111-111111111111';
const USER = '22222222-2222-2222-2222-222222222222';

async function upsert(table: string, row: Record<string, unknown>, onConflict: string) {
  const { data, error } = await supabase.from(table).upsert(row, { onConflict }).select().single();
  if (error) throw new Error(`${table}: ${error.message}`);
  return data;
}

await upsert('organizations', { id: ORG, name: 'G-HAL Pilot Co' }, 'id');
await upsert('roles', { id: '33333333-3333-3333-3333-333333333333', tenant_id: ORG, name: 'finance_manager', permissions: ['approve', 'view'] }, 'tenant_id,name');
await upsert('users', { id: USER, tenant_id: ORG, email: 'pilot@ghal.dev', name: 'Pilot Manager' }, 'tenant_id,email');
await upsert('user_roles', { tenant_id: ORG, user_id: USER, role_id: '33333333-3333-3333-3333-333333333333' }, 'user_id,role_id');

await upsert('actors', {
  id: '44444444-4444-4444-4444-444444444444', tenant_id: ORG, type: 'agent',
  ref: JSON.stringify({
    agent_id: 'invoice-extraction-agent', purpose: 'Extract invoice data from raw documents',
    input_schema: { type: 'object' }, output_schema: { type: 'object' },
    allowed_tools: ['extract_invoice_fields'], allowed_systems: ['email-gateway'],
    permission_scope: 'read-only', risk_level: 'med', confidence_requirement: 0.8,
    timeout_ms: 60000, retry: 2, escalation: 'finance_manager',
    audit_requirements: ['prompt_hash', 'output', 'evidence_refs'],
  }),
  name: 'Invoice Extraction Agent',
}, 'tenant_id,type,ref');

await upsert('policies', {
  id: '55555555-5555-5555-5555-555555555555', tenant_id: ORG, name: 'financial-approval', version: 1,
  as_code: {
    rules: [
      { id: 'r-high', when: [{ fact: 'risk.level', op: 'eq', value: 'high' }], then: 'REQUIRE_APPROVAL', reason: 'high risk requires human approval' },
      { id: 'r-amount', when: [{ fact: 'amount', op: 'gt', value: { '$param': 'approval_threshold' } }], then: 'REQUIRE_APPROVAL', reason: 'amount exceeds threshold' },
    ],
  },
}, 'id');

await upsert('parameters', { tenant_id: ORG, key: 'approval_threshold', value: 10000, version: 1 }, 'tenant_id,key');
await upsert('processes', { id: ir.process_id, tenant_id: ORG, name: 'Invoice Processing', description: 'Supplier invoice workflow — Pilot', created_by: USER, status: 'active' }, 'id');
await upsert('process_versions', {
  id: '66666666-6666-6666-6666-666666666666', tenant_id: ORG,
  process_id: ir.process_id, version: 1, status: 'active', ir, change_reason: 'pilot baseline',
}, 'process_id,version');

console.log('Seed complete');
