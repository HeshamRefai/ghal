/**
 * Mandatory governance tests — any build that fails here is rejected.
 */
import { describe, it, expect } from 'vitest';
import { evaluate, authorizeTool, type Policy, type AgentContract } from '@ghal/governance';

const approvalPolicy: Policy = {
  id: 'pol-approval', name: 'financial-approval', version: 1,
  rules: [
    { id: 'r-high', when: [{ fact: 'risk.level', op: 'eq', value: 'high' }], then: 'REQUIRE_APPROVAL', reason: 'high risk requires human approval' },
    { id: 'r-amount', when: [{ fact: 'amount', op: 'gt', value: 10000 }], then: 'REQUIRE_APPROVAL', reason: 'amount exceeds approval_threshold parameter' },
    { id: 'r-low', when: [{ fact: 'risk.level', op: 'eq', value: 'low' }], then: 'GRANT', reason: 'low risk auto-approve' },
  ],
};

describe('Policy engine — deny by default (P2)', () => {
  it('denies when no rule matches', () => {
    const r = evaluate(approvalPolicy, { risk: { level: 'med' }, amount: 500 });
    expect(r.decision).toBe('DENY');
    expect(r.reason).toContain('deny by default');
  });
  it('requires approval above threshold parameter', () => {
    const r = evaluate(approvalPolicy, { risk: { level: 'low' }, amount: 50000 });
    expect(r.decision).toBe('REQUIRE_APPROVAL');
    expect(r.ruleId).toBe('r-amount');
  });
  it('grants low risk under threshold', () => {
    expect(evaluate(approvalPolicy, { risk: { level: 'low' }, amount: 100 }).decision).toBe('GRANT');
  });
});

describe('Agent contracts — tool abuse is blocked', () => {
  const contract: AgentContract = {
    agentId: 'discovery-agent', permissionScope: 'read-only',
    allowedTools: ['read_document'], allowedSystems: ['drive'],
    riskLevel: 'low', confidenceRequirement: 0.8,
  };
  it('denies tool outside allowed_tools', () => {
    const r = authorizeTool(contract, 'send_email', 'drive');
    expect(r.decision).toBe('DENY');
    expect(r.reason).toContain('not in agent contract');
  });
  it('denies system outside allowed_systems', () => {
    const r = authorizeTool(contract, 'read_document', 'erp_prod');
    expect(r.decision).toBe('DENY');
  });
  it('denies everything when scope is none', () => {
    const r = authorizeTool({ ...contract, permissionScope: 'none' }, 'read_document', 'drive');
    expect(r.decision).toBe('DENY');
  });
  it('grants within contract scope', () => {
    expect(authorizeTool(contract, 'read_document', 'drive').decision).toBe('GRANT');
  });
});
