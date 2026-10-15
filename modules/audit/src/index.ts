/**
 * Audit Module — P10: Append-only + Hash chaining
 */
import { createHash } from 'node:crypto';

export function hashEntry(prevHash: string, parts: Record<string, unknown>): string {
  const canonical = JSON.stringify(parts, Object.keys(parts).sort());
  return createHash('sha256').update(prevHash + canonical).digest('hex');
}

export interface AuditRecord {
  tenantId: string;
  actorId?: string;
  action: string;
  objectType: string;
  objectId?: string;
  payload?: Record<string, unknown>;
}

export interface AuditStore {
  lastHash(tenantId: string): Promise<string | null>;
  insert(rec: AuditRecord & { prevHash: string; hash: string }): Promise<void>;
}

export class AuditWriter {
  constructor(private store: AuditStore) {}
  async append(rec: AuditRecord): Promise<string> {
    const prevHash = (await this.store.lastHash(rec.tenantId)) ?? 'GENESIS';
    const hash = hashEntry(prevHash, {
      actor: rec.actorId ?? null, action: rec.action,
      objectType: rec.objectType, objectId: rec.objectId ?? null,
      payload: rec.payload ?? {},
    });
    await this.store.insert({ ...rec, prevHash, hash });
    return hash;
  }
  async verifyChain(records: Array<AuditRecord & { prevHash: string; hash: string }>): Promise<boolean> {
    let prev = 'GENESIS';
    for (const r of records) {
      if (r.prevHash !== prev) return false;
      const expect = hashEntry(prev, {
        actor: r.actorId ?? null, action: r.action,
        objectType: r.objectType, objectId: r.objectId ?? null,
        payload: r.payload ?? {},
      });
      if (expect !== r.hash) return false;
      prev = r.hash;
    }
    return true;
  }
}
