/**
 * اختبارات Runtime — تنفيذ محكوم
 */
import { describe, it, expect, vi } from 'vitest';
import { runStep, resolveAutonomy, type RuntimeDeps, type ExecutionContext } from '@ghal/runtime';
import type { IRStep } from '@ghal/process-ir';

const ctx: ExecutionContext = {
  tenantId: 't1', caseId: 'c1', processVersionId: 'v1', parameters: { approval_threshold: 10000 },
};

function makeStep(over: Partial<IRStep> = {}): IRStep {
  return {
    id: 's1', type: 'step', name: 'validate invoice',
    actor: { type: 'agent', ref: 'validation-agent' },
    autonomy: 'ALLOW', inputs: [], outputs: [], evidence_required: ['doc'],
    parameters: {}, risk: { level: 'low', reversibility: true },
    exceptions: [{ on: 'timeout', route: 'escalate' }],
    ...over,
  };
}

function makeDeps(over: Partial<RuntimeDeps> = {}): RuntimeDeps & { events: string[] } {
  const events: string[] = [];
  return {
    events,
    emit: async (e) => { events.push(e.type); },
    requestAuthorization: vi.fn(async () => true),
    routeAttention: vi.fn(async () => {}),
    approve: vi.fn(async () => true),
    handlers: { agent: { execute: async () => ({ output: { ok: true }, evidence: ['doc#1'], confidence: 0.95 }) } },
    ...over,
  } as RuntimeDeps & { events: string[] };
}

describe('Governed execution (I70)', () => {
  it('runs step: authorization → execute → completion event', async () => {
    const deps = makeDeps();
    await runStep(makeStep(), ctx, deps);
    expect(deps.events).toEqual(['step_started', 'step_completed']);
    expect(deps.approve).not.toHaveBeenCalled();
  });
  it('denied authorization routes attention and never executes (P2→P7)', async () => {
    const deps = makeDeps({ requestAuthorization: vi.fn(async () => false) });
    await runStep(makeStep(), ctx, deps);
    expect(deps.events).toEqual(['step_started', 'authorization_denied']);
    expect(deps.routeAttention).toHaveBeenCalledOnce();
  });
  it('rejected approval routes attention, no completion event', async () => {
    const deps = makeDeps({ approve: vi.fn(async () => false) });
    await runStep(makeStep({ type: 'approval' }), ctx, deps);
    expect(deps.events).toContain('approval_rejected');
    expect(deps.events).not.toContain('step_completed');
  });
});

describe('Autonomy boundary (I51/I52) — no blind trust', () => {
  it('high risk can never be ALLOW', async () => {
    expect(await resolveAutonomy(makeStep({ risk: { level: 'high', reversibility: false } }), ctx)).toBe('APPROVAL_REQUIRED');
  });
  it('low confidence downgrades ALLOW to SUPERVISED', async () => {
    const s = makeStep();
    expect(await resolveAutonomy(s, ctx, 0.5)).toBe('SUPERVISED');
    expect(await resolveAutonomy(s, ctx, 0.95)).toBe('ALLOW');
  });
});
