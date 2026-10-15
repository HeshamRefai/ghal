/**
 * Governance — Policy-as-Code engine (I53) + P2 Authorization
 * Absolute rule: Deny by default.
 */
export type Decision = 'GRANT' | 'DENY' | 'REQUIRE_APPROVAL';

export interface Condition {
  fact: string;
  op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in';
  value: unknown;
}

export interface PolicyRule {
  id: string;
  when: Condition[];
  then: Decision;
  reason: string;
}

export interface Policy {
  id: string;
  name: string;
  version: number;
  rules: PolicyRule[];
}

type Facts = Record<string, unknown>;

function getFact(facts: Facts, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, k) =>
    acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[k] : undefined, facts);
}

function check(cond: Condition, facts: Facts): boolean {
  const v = getFact(facts, cond.fact);
  switch (cond.op) {
    case 'eq': return v === cond.value;
    case 'neq': return v !== cond.value;
    case 'gt': return typeof v === 'number' && typeof cond.value === 'number' && v > cond.value;
    case 'gte': return typeof v === 'number' && typeof cond.value === 'number' && v >= cond.value;
    case 'lt': return typeof v === 'number' && typeof cond.value === 'number' && v < cond.value;
    case 'lte': return typeof v === 'number' && typeof cond.value === 'number' && v <= cond.value;
    case 'in': return Array.isArray(cond.value) && cond.value.includes(v);
  }
}

export interface AuthorizationResult {
  decision: Decision;
  ruleId?: string;
  reason: string;
}

export function evaluate(policy: Policy, facts: Facts): AuthorizationResult {
  for (const rule of policy.rules) {
    if (rule.when.every((c) => check(c, facts))) {
      return { decision: rule.then, ruleId: rule.id, reason: rule.reason };
    }
  }
  return { decision: 'DENY', reason: 'no matching rule — deny by default (P2)' };
}

export interface AgentContract {
  agentId: string;
  permissionScope: 'read-only' | 'read-write' | 'none';
  allowedTools: string[];
  allowedSystems: string[];
  riskLevel: 'low' | 'med' | 'high';
  confidenceRequirement: number;
}

export function authorizeTool(contract: AgentContract, tool: string, targetSystem: string): AuthorizationResult {
  if (!contract.allowedTools.includes(tool))
    return { decision: 'DENY', reason: `tool "${tool}" not in agent contract allowed_tools` };
  if (!contract.allowedSystems.includes(targetSystem))
    return { decision: 'DENY', reason: `system "${targetSystem}" not in agent contract allowed_systems` };
  if (contract.permissionScope === 'none')
    return { decision: 'DENY', reason: 'contract permission_scope is none' };
  return { decision: 'GRANT', reason: 'contract scope satisfied' };
}
