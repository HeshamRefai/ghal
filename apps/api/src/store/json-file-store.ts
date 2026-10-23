/**
 * JSON File Store — smallest maintainable dev persistence.
 *
 * Used when Supabase credentials are not configured. One JSON file per
 * environment (path from GHAL_DATA_DIR), atomic writes (tmp + rename).
 * Trade-off: no concurrent writers, no query planner — fine for a pilot,
 * replaced by the Supabase/Postgres schema (migrations 0001/0002) in prod.
 */
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { TaskEvent } from '@ghal/ingestion';
import type { Baseline } from '@ghal/metrics';
import type { Finding } from '@ghal/diagnostics';
import type { Proposal } from '@ghal/redesign';
import type { ProcessIR } from '@ghal/process-ir';
import type { AuditStore } from '@ghal/audit';

export type Permission = 'view' | 'propose' | 'approve' | 'execute' | 'configure' | 'admin';

export const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  admin: ['view', 'propose', 'approve', 'execute', 'configure', 'admin'],
  manager: ['view', 'propose', 'approve', 'execute', 'configure'],
  operator: ['view', 'execute'],
  agent: ['propose', 'execute'],
};

/** Serialized TaskEvent (dates as ISO strings). */
export type StoredEvent = Omit<TaskEvent, 'startedAt' | 'completedAt'> & { startedAt: string | null; completedAt: string | null };

export interface StoredProcess {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  status: 'draft' | 'active' | 'retired';
  created_by: string;
  created_at: string;
}

export interface StoredVersion {
  id: string;
  tenant_id: string;
  process_id: string;
  version: number;
  status: 'draft' | 'approved' | 'active' | 'archived';
  ir: ProcessIR;
  change_reason: string;
  proposal_id: string | null;
  created_by: string;
  created_at: string;
}

export interface StoredCase {
  id: string;
  tenant_id: string;
  process_version_id: string;
  external_ref: string | null;
  status: 'open' | 'completed';
  created_by: string;
  created_at: string;
}

export interface StoredCaseEvent {
  id: string;
  tenant_id: string;
  case_id: string;
  step_id: string;
  action: string;
  payload: Record<string, unknown>;
  actor_id: string;
  created_at: string;
}

export interface StoredAuditEvent {
  seq: number;
  tenant_id: string;
  actor_id: string | null;
  action: string;
  object_type: string;
  object_id: string | null;
  payload: Record<string, unknown>;
  prev_hash: string;
  hash: string;
  created_at: string;
}

interface TenantBucket {
  processes: Record<string, StoredProcess>;
  versions: Record<string, StoredVersion>;
  events: Record<string, StoredEvent[]>; // process_id → imported baseline events
  baselines: Record<string, Baseline>;
  findings: Record<string, Finding[]>;
  proposals: Record<string, Proposal>;
  cases: Record<string, StoredCase>;
  case_events: Record<string, StoredCaseEvent[]>;
  outcomes: Record<string, StoredEvent[]>; // process_id → post-change measured events
  users: Record<string, { id: string; email: string; name: string; roles: string[] }>;
  audit: StoredAuditEvent[];
}

interface FileShape {
  tenants: Record<string, TenantBucket>;
}

const emptyBucket = (): TenantBucket => ({
  processes: {},
  versions: {},
  events: {},
  baselines: {},
  findings: {},
  proposals: {},
  cases: {},
  case_events: {},
  outcomes: {},
  users: {},
  audit: [],
});

export function serializeEvent(e: TaskEvent): StoredEvent {
  return { ...e, startedAt: e.startedAt ? e.startedAt.toISOString() : null, completedAt: e.completedAt ? e.completedAt.toISOString() : null };
}

export function reviveEvent(e: StoredEvent): TaskEvent {
  return { ...e, startedAt: e.startedAt ? new Date(e.startedAt) : null, completedAt: e.completedAt ? new Date(e.completedAt) : null };
}

export class JsonFileStore implements AuditStore {
  private file: string;
  private data: FileShape;

  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true });
    this.file = join(dataDir, 'ghal-dev-store.json');
    this.data = existsSync(this.file) ? (JSON.parse(readFileSync(this.file, 'utf8')) as FileShape) : { tenants: {} };
  }

  private bucket(tenantId: string): TenantBucket {
    if (!this.data.tenants[tenantId]) this.data.tenants[tenantId] = emptyBucket();
    return this.data.tenants[tenantId];
  }

  private flush(): void {
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    renameSync(tmp, this.file);
  }

  // --- users / permissions ---
  upsertUser(tenantId: string, user: { id: string; email: string; name: string; roles: string[] }): void {
    this.bucket(tenantId).users[user.id] = user;
    this.flush();
  }

  getUser(tenantId: string, userId: string) {
    return this.bucket(tenantId).users[userId] ?? null;
  }

  permissionsFor(tenantId: string, userId: string): Set<Permission> {
    const u = this.getUser(tenantId, userId);
    const out = new Set<Permission>();
    for (const r of u?.roles ?? []) for (const p of ROLE_PERMISSIONS[r] ?? []) out.add(p);
    return out;
  }

  // --- processes / versions ---
  insertProcess(p: StoredProcess): void {
    this.bucket(p.tenant_id).processes[p.id] = p;
    this.flush();
  }
  getProcess(tenantId: string, id: string): StoredProcess | null {
    return this.bucket(tenantId).processes[id] ?? null;
  }
  listProcesses(tenantId: string): StoredProcess[] {
    return Object.values(this.bucket(tenantId).processes);
  }

  insertVersion(v: StoredVersion): void {
    this.bucket(v.tenant_id).versions[v.id] = v;
    this.flush();
  }
  getVersion(tenantId: string, id: string): StoredVersion | null {
    return this.bucket(tenantId).versions[id] ?? null;
  }
  listVersions(tenantId: string, processId: string): StoredVersion[] {
    return Object.values(this.bucket(tenantId).versions)
      .filter((v) => v.process_id === processId)
      .sort((a, b) => a.version - b.version);
  }
  updateVersionStatus(tenantId: string, id: string, status: StoredVersion['status']): void {
    const v = this.bucket(tenantId).versions[id];
    if (v) {
      v.status = status;
      this.flush();
    }
  }

  // --- events / baselines / findings ---
  putEvents(tenantId: string, processId: string, events: StoredEvent[]): void {
    this.bucket(tenantId).events[processId] = events;
    this.flush();
  }
  getEvents(tenantId: string, processId: string): StoredEvent[] {
    return this.bucket(tenantId).events[processId] ?? [];
  }
  putBaseline(tenantId: string, processId: string, b: Baseline): void {
    this.bucket(tenantId).baselines[processId] = b;
    this.flush();
  }
  getBaseline(tenantId: string, processId: string): Baseline | null {
    return this.bucket(tenantId).baselines[processId] ?? null;
  }
  putFindings(tenantId: string, processId: string, f: Finding[]): void {
    this.bucket(tenantId).findings[processId] = f;
    this.flush();
  }
  getFindings(tenantId: string, processId: string): Finding[] {
    return this.bucket(tenantId).findings[processId] ?? [];
  }

  // --- proposals ---
  insertProposal(tenantId: string, p: Proposal): void {
    this.bucket(tenantId).proposals[p.id] = p;
    this.flush();
  }
  getProposal(tenantId: string, id: string): Proposal | null {
    return this.bucket(tenantId).proposals[id] ?? null;
  }
  listProposals(tenantId: string, processId: string): Proposal[] {
    return Object.values(this.bucket(tenantId).proposals).filter((p) => p.processId === processId);
  }
  updateProposalStatus(tenantId: string, id: string, status: Proposal['status']): void {
    const p = this.bucket(tenantId).proposals[id];
    if (p) {
      p.status = status;
      this.flush();
    }
  }

  // --- runtime cases ---
  insertCase(c: StoredCase): void {
    this.bucket(c.tenant_id).cases[c.id] = c;
    this.flush();
  }
  getCase(tenantId: string, id: string): StoredCase | null {
    return this.bucket(tenantId).cases[id] ?? null;
  }
  addCaseEvent(e: StoredCaseEvent): void {
    const b = this.bucket(e.tenant_id);
    if (!b.case_events[e.case_id]) b.case_events[e.case_id] = [];
    b.case_events[e.case_id]!.push(e);
    this.flush();
  }
  listCaseEvents(tenantId: string, caseId: string): StoredCaseEvent[] {
    return this.bucket(tenantId).case_events[caseId] ?? [];
  }

  // --- outcomes ---
  putOutcomes(tenantId: string, processId: string, events: StoredEvent[]): void {
    this.bucket(tenantId).outcomes[processId] = events;
    this.flush();
  }
  getOutcomes(tenantId: string, processId: string): StoredEvent[] {
    return this.bucket(tenantId).outcomes[processId] ?? [];
  }

  // --- audit (implements AuditStore for AuditWriter) ---
  async lastHash(tenantId: string): Promise<string | null> {
    const a = this.bucket(tenantId).audit;
    return a.length === 0 ? null : a[a.length - 1]!.hash;
  }
  async insert(rec: { tenantId: string; actorId?: string; action: string; objectType: string; objectId?: string; payload?: Record<string, unknown>; prevHash: string; hash: string }): Promise<void> {
    const b = this.bucket(rec.tenantId);
    b.audit.push({
      seq: b.audit.length + 1,
      tenant_id: rec.tenantId,
      actor_id: rec.actorId ?? null,
      action: rec.action,
      object_type: rec.objectType,
      object_id: rec.objectId ?? null,
      payload: rec.payload ?? {},
      prev_hash: rec.prevHash,
      hash: rec.hash,
      created_at: new Date().toISOString(),
    });
    this.flush();
  }
  listAudit(tenantId: string): StoredAuditEvent[] {
    return this.bucket(tenantId).audit;
  }
}
