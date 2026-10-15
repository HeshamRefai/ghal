/**
 * اختبارات Process IR + Protocols
 */
import { describe, it, expect } from 'vitest';
import { validateIR, IR_VERSION, type ProcessIR } from '@ghal/process-ir';
import { transition, P2_AUTHORIZATION, P5_EVOLUTION } from '@ghal/protocols';

const validIR: ProcessIR = {
  ir_version: IR_VERSION, process_id: 'p1', version: 1,
  outcome: { statement: 'pay supplier invoices on time', kpis: [{ name: 'cycle_time', target: 48, unit: 'h' }] },
  modules: [{
    id: 'm1', name: 'Intake', order: 1,
    steps: [
      { id: 's1', type: 'step', name: 'receive', actor: { type: 'system', ref: 'email' }, autonomy: 'ALLOW', inputs: [], outputs: ['invoice_raw'], evidence_required: [], parameters: {}, risk: { level: 'low', reversibility: true }, exceptions: [] },
      { id: 's2', type: 'approval', name: 'approve', actor: { type: 'human', ref: 'manager' }, autonomy: 'APPROVAL_REQUIRED', inputs: ['invoice_raw'], outputs: [], evidence_required: ['doc'], parameters: {}, risk: { level: 'med', reversibility: true }, exceptions: [] },
    ],
    transitions: [
      { from: null, to: 's1' },
      { from: 's1', to: 's2', condition_param: 'amount_ok' },
    ],
  }],
  policies: [{ ref: 'pol-approval', rules: ['r-amount'] }],
  metrics: [{ name: 'cycle_time', source: 'events' }],
  governance: { audit_level: 'full', approval_points: ['s2'] },
};

describe('Process IR validation', () => {
  it('accepts a valid IR', () => { expect(validateIR(validIR)).toEqual([]); });
  it('rejects missing outcome (Outcome-First)', () => {
    const ir = structuredClone(validIR); ir.outcome.statement = '';
    expect(validateIR(ir)).toContain('outcome.statement required (Outcome-First)');
  });
  it('rejects ALLOW on approval step', () => {
    const ir = structuredClone(validIR); ir.modules[0]!.steps[1]!.autonomy = 'ALLOW';
    expect(validateIR(ir).some((e) => e.includes('cannot have autonomy ALLOW'))).toBe(true);
  });
  it('rejects high-risk ALLOW (policy)', () => {
    const ir = structuredClone(validIR); ir.modules[0]!.steps[0]!.risk.level = 'high';
    expect(validateIR(ir).some((e) => e.includes('cannot be ALLOW'))).toBe(true);
  });
  it('rejects transition to unknown step', () => {
    const ir = structuredClone(validIR); ir.modules[0]!.transitions[1]!.to = 's99';
    expect(validateIR(ir).some((e) => e.includes('unknown step'))).toBe(true);
  });
  it('rejects missing entry point', () => {
    const ir = structuredClone(validIR); ir.modules[0]!.transitions = ir.modules[0]!.transitions.filter((t) => t.from !== null);
    expect(validateIR(ir)).toContain('no entry transition');
  });
});

describe('Protocol state machines', () => {
  it('P2: legal path REQUESTED→CHECKED→GRANTED→LOGGED', () => {
    let s = P2_AUTHORIZATION.initial;
    s = transition(P2_AUTHORIZATION, s, 'CHECK');
    s = transition(P2_AUTHORIZATION, s, 'GRANT');
    s = transition(P2_AUTHORIZATION, s, 'LOG');
    expect(s).toBe('LOGGED');
  });
  it('P2: GRANT without CHECK is illegal', () => {
    expect(() => transition(P2_AUTHORIZATION, 'REQUESTED', 'GRANT')).toThrow(/invalid transition/);
  });
  it('P5: no rollout without approval', () => {
    expect(() => transition(P5_EVOLUTION, 'SIMULATED', 'ROLLOUT')).toThrow();
    let s = transition(P5_EVOLUTION, P5_EVOLUTION.initial, 'PROPOSE');
    s = transition(P5_EVOLUTION, s, 'ANALYZE');
    s = transition(P5_EVOLUTION, s, 'SIMULATE');
    s = transition(P5_EVOLUTION, s, 'APPROVE');
    s = transition(P5_EVOLUTION, s, 'ROLLOUT');
    expect(s).toBe('ROLLED_OUT');
  });
});
