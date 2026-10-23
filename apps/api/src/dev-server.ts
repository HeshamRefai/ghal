/**
 * Dev server — runs the vertical slice without Supabase.
 *
 * Persistence: JsonFileStore at GHAL_DATA_DIR (default ./.ghal-data).
 * Pilot users are seeded on first start. This mode is for local development
 * and demos; production uses the Supabase schema (migrations 0001/0002).
 */
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { createVerticalSliceApp } from './vertical-slice.js';
import { JsonFileStore } from './store/json-file-store.js';

const dataDir = process.env.GHAL_DATA_DIR ?? './.ghal-data';
const store = new JsonFileStore(dataDir);

const PILOT_TENANT = process.env.PILOT_TENANT ?? '11111111-1111-1111-1111-111111111111';
const seedUsers = [
  { id: 'aaaaaaaa-0000-0000-0000-000000000001', email: 'admin@agency.test', name: 'Agency Admin', roles: ['admin'] },
  { id: 'aaaaaaaa-0000-0000-0000-000000000002', email: 'manager@agency.test', name: 'Ops Manager', roles: ['manager'] },
  { id: 'aaaaaaaa-0000-0000-0000-000000000003', email: 'operator@agency.test', name: 'Campaign Operator', roles: ['operator'] },
];
for (const u of seedUsers) {
  if (!store.getUser(PILOT_TENANT, u.id)) store.upsertUser(PILOT_TENANT, u);
}

const app = new Hono();
app.get('/health', (c) => c.json({ ok: true, mode: 'dev-json-store' }));
app.route('/vs', createVerticalSliceApp({ store }));

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port });
console.log(`G-HAL dev API on :${port} (vertical slice at /vs, data dir ${dataDir})`);
console.log(`Pilot tenant: ${PILOT_TENANT}`);
console.log(`Pilot users: ${seedUsers.map((u) => `${u.email}=${u.id}`).join(', ')}`);
