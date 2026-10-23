/**
 * Redesign tests — proposal structure, IR compilation, versioning rules.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { importTaskEvents } from '@ghal/ingestion';
import { computeBaseline } from '@ghal/metrics';
import { detectFindings } from '@ghal/diagnostics';
import { generateProposals, compileProposal, irFromObservedSteps, validateProposal } from '@ghal/redesign';
import { validateIR } from '@ghal/process-ir';

const { events } = importTaskEvents(readFileSync('tests/fixtures/campaign-launch.csv', 'utf8'));
const baseline = computeBaseline(events);
const findings = detectFindings(events, baseline);

function observedIr() {
  const seen = new Map<string, { localId: string; taskName: string; ownerRole: string; dependsOn: string | null; requiresApproval: boolean }>();
  for (const e of events) {
    if (!seen.has(e.localId)) seen.set(e.localId, { localId: e.localId, taskName: e.taskName, ownerRole: e.ownerRole, dependsOn: e.dependsOn, requiresApproval: e.approvalStatus !== null });
  }
  return irFromObservedSteps('proc-1', [...seen.values()]);
}

describe('irFromObservedSteps', () => {
  it('compiles a valid draft IR from observed steps', () => {
    const ir = observedIr();
    expect(validateIR(ir)).toEqual([]);
    expect(ir.version).toBe(1);
    // approval steps are never ALLOW
    for (const m of ir.modules) for (const s of m.steps) if (s.type === 'approval') expect(s.autonomy).not.toBe('ALLOW');
  });
});

describe('generateProposals', () => {
  const ir = observedIr();
  const proposals = generateProposals(ir, findings, baseline, '2026-10-23T00:00:00Z');

  it('produces a conservative and a substantial redesign (non-cosmetic)', () => {
    expect(proposals.length).toBeGreaterThanOrEqual(2);
    expect(proposals.some((p) => p.kind === 'conservative')).toBe(true);
    expect(proposals.some((p) => p.kind === 'redesign')).toBe(true);
    const titles = new Set(proposals.map((p) => p.title));
    expect(titles.size).toBe(proposals.length); // no cosmetic duplicates
  });

  it('every proposal passes schema validation and references evidence', () => {
    for (const p of proposals) {
      expect(validateProposal(p)).toEqual([]);
      for (const ref of p.evidenceRefs) expect(findings.some((f) => f.id === ref)).toBe(true);
    }
  });

  it('labels expected benefits as estimates with assumptions', () => {
    for (const p of proposals) for (const b of p.expectedBenefits) {
      expect(b.kind).toBe('estimate');
      expect(b.assumptions.length).toBeGreaterThan(0);
    }
  });

  it('approval proposal carries SLA test criterion and rollback conditions', () => {
    const p = proposals.find((x) => x.id.includes('approval') && x.kind === 'conservative')!;
    expect(p.testPlan.successCriterion).toContain('cycle time');
    expect(p.testPlan.rollbackConditions.length).toBeGreaterThan(0);
  });
});

describe('compileProposal', () => {
  const ir = observedIr();
  const proposals = generateProposals(ir, findings, baseline, '2026-10-23T00:00:00Z');

  it('produces a valid IR with incremented version', () => {
    const p = proposals.find((x) => x.id.includes('approval') && x.kind === 'conservative')!;
    const next = compileProposal(ir, p);
    expect(next.version).toBe(ir.version + 1);
    expect(validateIR(next)).toEqual([]);
  });

  it('sets SLA + escalation on the approval step without weakening approval authority', () => {
    const p = proposals.find((x) => x.id.includes('approval') && x.kind === 'conservative')!;
    const next = compileProposal(ir, p);
    const step = next.modules.flatMap((m) => m.steps).find((s) => s.id === 'client_approval')!;
    expect(step.parameters['sla_hours']).toBe(24);
    expect(step.autonomy).toBe('APPROVAL_REQUIRED');
    expect(step.exceptions.some((e) => e.on === 'sla_breach')).toBe(true);
  });

  it('inserts a validated quality gate for rework proposals', () => {
    const p = proposals.find((x) => x.id.includes('rework'))!;
    const next = compileProposal(ir, p);
    expect(validateIR(next)).toEqual([]);
    const gate = next.modules.flatMap((m) => m.steps).find((s) => s.id === 'design_input_gate')!;
    expect(gate.type).toBe('approval');
    expect(gate.autonomy).toBe('APPROVAL_REQUIRED');
    // gate is wired into the transition graph
    const mod = next.modules.find((m) => m.steps.some((s) => s.id === 'design_input_gate'))!;
    expect(mod.transitions.some((t) => t.from === 'design_input_gate' && t.to === 'design')).toBe(true);
  });

  it('never rewrites history: the original IR object is untouched', () => {
    const before = JSON.stringify(ir);
    compileProposal(ir, proposals[0]!);
    expect(JSON.stringify(ir)).toBe(before);
  });
});
