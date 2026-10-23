/**
 * Redesign Module — structured operating-model proposals.
 *
 * Deterministic, template-driven proposal generation: each finding type maps
 * to explicit change templates. Every proposal states what changes, why,
 * which evidence supports it, expected benefits (labeled ESTIMATES with
 * assumptions), trade-offs, risks, a testable success criterion, and
 * rollback conditions. `compileProposal` turns an approved proposal into a
 * new, validated Process IR version.
 */
import type { ProcessIR, IRStep, IRModule, IRTransition } from '@ghal/process-ir';
import { validateIR } from '@ghal/process-ir';
import type { Finding } from '@ghal/diagnostics';
import type { Baseline } from '@ghal/metrics';
import { getMetric } from '@ghal/metrics';

export type ProposalStatus = 'draft' | 'approved' | 'rejected' | 'deployed' | 'measured';

export interface ExpectedBenefit {
  metric: string;
  baselineValue: number | null;
  estimatedDeltaPct: number;
  /** Always 'estimate' — never presented as measured. */
  kind: 'estimate';
  assumptions: string[];
}

export interface Proposal {
  id: string;
  processId: string;
  basedOnVersion: number;
  title: string;
  kind: 'conservative' | 'redesign';
  changes: string[];
  rationale: string;
  /** Finding ids that support this proposal. */
  evidenceRefs: string[];
  expectedBenefits: ExpectedBenefit[];
  tradeoffs: string[];
  implementationCosts: string[];
  risks: string[];
  assumptions: string[];
  testPlan: {
    hypothesis: string;
    successCriterion: string;
    measurementPeriodDays: number;
    rollbackConditions: string[];
  };
  status: ProposalStatus;
  createdAt: string;
}

/** Manual schema check, same style as validateIR — no external deps. */
export function validateProposal(p: Proposal): string[] {
  const errors: string[] = [];
  if (!p.id.trim()) errors.push('id required');
  if (!p.title.trim()) errors.push('title required');
  if (p.changes.length === 0) errors.push('at least one change required');
  if (!p.rationale.trim()) errors.push('rationale required');
  if (p.evidenceRefs.length === 0) errors.push('proposal must reference at least one finding (evidence)');
  if (p.risks.length === 0) errors.push('risks must be stated explicitly');
  if (p.assumptions.length === 0) errors.push('assumptions must be stated explicitly');
  if (!p.testPlan.successCriterion.trim()) errors.push('testable success criterion required');
  if (p.testPlan.measurementPeriodDays < 1) errors.push('measurement period must be >= 1 day');
  if (p.testPlan.rollbackConditions.length === 0) errors.push('rollback conditions required');
  for (const b of p.expectedBenefits) {
    if (b.kind !== 'estimate') errors.push(`expected benefit "${b.metric}" must be labeled kind='estimate'`);
  }
  return errors;
}

const MEASUREMENT_DAYS = 14;

/** Generate a conservative improvement and (where warranted) a deeper redesign. */
export function generateProposals(
  current: ProcessIR,
  findings: Finding[],
  baseline: Baseline,
  createdAt = new Date().toISOString(),
): Proposal[] {
  const proposals: Proposal[] = [];
  const n = findings.length;

  const approval = findings.find((f) => f.type === 'approval_bottleneck');
  const rework = findings.find((f) => f.type === 'rework_loop');
  const waiting = findings.filter((f) => f.type === 'waiting_bottleneck');

  const avgCycle = getMetric(baseline, 'avg_cycle_time_hours')?.value ?? null;
  const apprWait = getMetric(baseline, 'avg_approval_waiting_hours')?.value ?? null;

  if (approval) {
    proposals.push({
      id: `proposal-conservative-approval-${createdAt}`,
      processId: current.process_id,
      basedOnVersion: current.version,
      title: 'Approval SLA with escalation and parallel prep',
      kind: 'conservative',
      changes: [
        `Add a 24h SLA with automatic escalation on approval step(s): ${approval.affectedSteps.join(', ')}`,
        'Allow downstream preparation (launch checklist) to proceed in parallel while approval is pending',
        'Keep approval authority and audit requirements unchanged',
      ],
      rationale:
        `Approval-required steps account for ${((approval.evidence.values['approval_wait_share'] ?? 0) * 100).toFixed(1)}% of all waiting time ` +
        `(${apprWait?.toFixed(1) ?? '?'}h per case on average). Bounding that wait with an SLA and escalation addresses the largest measured delay without changing who decides.`,
      evidenceRefs: [approval.id],
      expectedBenefits: [
        {
          metric: 'avg_cycle_time_hours',
          baselineValue: avgCycle,
          estimatedDeltaPct: -30,
          kind: 'estimate',
          assumptions: [
            'approvers respond within the 24h SLA in most cases',
            'parallel preparation does not increase rework',
          ],
        },
      ],
      tradeoffs: ['escalations add management attention load', 'parallel prep work may be discarded when approval is rejected'],
      implementationCosts: ['configure SLA parameter and escalation target', 'brief approvers on the new SLA'],
      risks: ['approvers may treat the SLA as a target and delay previously-fast approvals', 'escalation fatigue if SLA is set too tight'],
      assumptions: ['waiting measured in the import is representative of normal operations', 'approval latency is reducible without reducing approval quality'],
      testPlan: {
        hypothesis: 'Bounding approval wait reduces average cycle time without increasing revision rates.',
        successCriterion: 'avg cycle time decreases by ≥ 15% vs baseline over the measurement period, with avg revisions per case not increasing by more than 10%',
        measurementPeriodDays: MEASUREMENT_DAYS,
        rollbackConditions: ['revision rate increases by more than 10%', 'approval rejections increase materially', 'escalations fire on more than 50% of cases'],
      },
      status: 'draft',
      createdAt,
    });
  }

  if (rework) {
    proposals.push({
      id: `proposal-conservative-rework-${createdAt}`,
      processId: current.process_id,
      basedOnVersion: current.version,
      title: 'Quality gate before rework-prone step',
      kind: 'conservative',
      changes: [
        `Add an explicit quality gate (brief completeness check) before "${rework.affectedSteps.join(', ')}"`,
        'Require the gate to record a checklist as evidence before work starts',
      ],
      rationale:
        `"${rework.affectedSteps.join(', ')}" averages ${rework.evidence.values[`avg_revisions:${rework.affectedSteps[0]}`]?.toFixed(2) ?? '?'} revisions per case. ` +
        'A completeness gate before the step targets the most common upstream cause of rework (incomplete inputs).',
      evidenceRefs: [rework.id],
      expectedBenefits: [
        {
          metric: 'avg_revisions_per_case',
          baselineValue: getMetric(baseline, 'avg_revisions_per_case')?.value ?? null,
          estimatedDeltaPct: -40,
          kind: 'estimate',
          assumptions: ['a meaningful share of revisions is caused by incomplete inputs — not directly observable from imported data'],
        },
      ],
      tradeoffs: ['adds one checkpoint (small added cycle time if the gate is fast)'],
      implementationCosts: ['define the completeness checklist', 'train the team on the gate'],
      risks: ['gate becomes a rubber stamp if not enforced', 'revisions may be caused by client preference changes rather than input quality'],
      assumptions: ['revision counts in the import are accurate'],
      testPlan: {
        hypothesis: 'A completeness gate reduces revisions at the affected step.',
        successCriterion: 'avg revisions per case decreases by ≥ 25% over the measurement period without cycle time increasing by more than 10%',
        measurementPeriodDays: MEASUREMENT_DAYS,
        rollbackConditions: ['cycle time increases by more than 10%', 'revisions do not decrease after the period'],
      },
      status: 'draft',
      createdAt,
    });
  }

  if (approval && (approval.evidence.values['approval_wait_share'] ?? 0) >= 0.5) {
    proposals.push({
      id: `proposal-redesign-approval-${createdAt}`,
      processId: current.process_id,
      basedOnVersion: current.version,
      title: 'Batched approval window with default-escalate',
      kind: 'redesign',
      changes: [
        'Replace per-case client approval with a twice-weekly batched approval window',
        'Cases not decided within the window escalate automatically to the account director',
        'Pre-approval compliance checklist compiled by the account manager before the window',
      ],
      rationale:
        'Approval waiting dominates total waiting; batching converts scattered, multi-day idle waits into two fixed decision points per week. This is a structural change, not a parameter tweak.',
      evidenceRefs: [approval.id],
      expectedBenefits: [
        {
          metric: 'avg_approval_waiting_hours',
          baselineValue: apprWait,
          estimatedDeltaPct: -60,
          kind: 'estimate',
          assumptions: ['clients accept a batched approval cadence', 'batch size per window stays manageable'],
        },
      ],
      tradeoffs: ['less flexible for urgent campaigns', 'requires client agreement to the new cadence'],
      implementationCosts: ['renegotiate approval cadence with clients', 'build the pre-approval checklist', 'calendar/window management'],
      risks: ['clients reject batching', 'urgent campaigns bypass the window, recreating ad-hoc waits', 'decision quality may drop under batch time pressure'],
      assumptions: ['the client relationship supports a cadence change'],
      testPlan: {
        hypothesis: 'Batched approvals reduce approval waiting substantially without reducing approval quality.',
        successCriterion: 'avg approval waiting decreases by ≥ 40% with no increase in post-approval revisions',
        measurementPeriodDays: MEASUREMENT_DAYS * 2,
        rollbackConditions: ['client satisfaction complaints', 'post-approval revisions increase', 'more than 25% of cases bypass the window'],
      },
      status: 'draft',
      createdAt,
    });
  }

  // Generic fallback when no specific template matched: never emit cosmetic proposals.
  if (proposals.length === 0 && n > 0) {
    const f = findings[0]!;
    proposals.push({
      id: `proposal-conservative-generic-${createdAt}`,
      processId: current.process_id,
      basedOnVersion: current.version,
      title: `Targeted improvement for: ${f.title}`,
      kind: 'conservative',
      changes: [`Address "${f.title}" at step(s): ${f.affectedSteps.join(', ') || '(process-level)'}`],
      rationale: f.summary,
      evidenceRefs: [f.id],
      expectedBenefits: [],
      tradeoffs: ['to be assessed during review'],
      implementationCosts: ['to be assessed during review'],
      risks: ['proposal generated from a generic template — review carefully before approval'],
      assumptions: f.limitations,
      testPlan: {
        hypothesis: `Addressing "${f.title}" improves the affected metric.`,
        successCriterion: 'to be made specific by the approver before deployment',
        measurementPeriodDays: MEASUREMENT_DAYS,
        rollbackConditions: ['no measurable improvement after the period'],
      },
      status: 'draft',
      createdAt,
    });
  }

  return proposals;
}

/**
 * Compile an approved proposal into a new Process IR version.
 * Deterministic structural edits; result is validated with validateIR.
 */
export function compileProposal(current: ProcessIR, proposal: Proposal): ProcessIR {
  const next: ProcessIR = JSON.parse(JSON.stringify(current)) as ProcessIR;
  next.version = current.version + 1;

  for (const mod of next.modules) {
    for (const step of mod.steps) {
      if (proposal.changes.some((c) => c.includes(step.id)) || proposal.changes.some((c) => c.includes(step.name))) {
        if (proposal.id.includes('approval')) {
          step.parameters = { ...step.parameters, sla_hours: 24, escalation: 'account_director' };
          // Approval authority is preserved: approval steps never become ALLOW.
          if (step.type === 'approval') step.autonomy = 'APPROVAL_REQUIRED';
          if (!step.exceptions.some((e) => e.on === 'sla_breach')) {
            step.exceptions = [...step.exceptions, { on: 'sla_breach', route: 'escalate' }];
          }
        }
        if (proposal.id.includes('rework')) {
          step.evidence_required = [...new Set([...step.evidence_required, 'input_completeness_checklist'])];
        }
      }
    }
  }

  if (proposal.id.includes('rework')) {
    // Insert a quality-gate approval step before the rework-prone step.
    for (const mod of next.modules) {
      const idx = mod.steps.findIndex((s) => proposal.changes.some((c) => c.includes(s.id) || c.includes(s.name)));
      if (idx > -1) {
        const target = mod.steps[idx]!;
        const gate: IRStep = {
          id: `${target.id}_input_gate`,
          type: 'approval',
          name: `Input completeness gate: ${target.name}`,
          actor: { type: 'human', ref: 'account_manager' },
          autonomy: 'APPROVAL_REQUIRED',
          inputs: ['brief', 'requirements'],
          outputs: ['completeness_checklist'],
          evidence_required: ['input_completeness_checklist'],
          parameters: {},
          risk: { level: 'low', reversibility: true },
          exceptions: [{ on: 'incomplete_input', route: 'human' }],
        };
        if (!mod.steps.some((s) => s.id === gate.id)) {
          mod.steps.splice(idx, 0, gate);
          mod.transitions = mod.transitions.map((t) => (t.to === target.id ? { ...t, to: gate.id } : t));
          mod.transitions.push({ from: gate.id, to: target.id });
        }
      }
    }
  }

  next.governance = { ...next.governance, approval_points: [...new Set([...next.governance.approval_points, `proposal:${proposal.id}`])] };

  const errors = validateIR(next);
  if (errors.length > 0) throw new Error(`compiled IR invalid: ${errors.join('; ')}`);
  return next;
}

/** Build a draft IR v1 from observed imported steps (current operating model). */
export function irFromObservedSteps(processId: string, steps: Array<{ localId: string; taskName: string; ownerRole: string; dependsOn: string | null; requiresApproval: boolean }>): ProcessIR {
  const irSteps: IRStep[] = steps.map((s) => ({
    id: s.localId,
    type: s.requiresApproval ? 'approval' : 'step',
    name: s.taskName,
    actor: { type: 'human', ref: s.ownerRole || 'unassigned' },
    autonomy: s.requiresApproval ? 'APPROVAL_REQUIRED' : 'SUPERVISED',
    inputs: [],
    outputs: [],
    evidence_required: [],
    parameters: {},
    risk: { level: 'low', reversibility: true },
    exceptions: [{ on: 'error', route: 'human' }],
  }));
  const transitions: IRTransition[] = steps
    .filter((s) => s.dependsOn)
    .map((s) => ({ from: s.dependsOn!, to: s.localId }));
  const hasIncoming = new Set(transitions.map((t) => t.to));
  for (const s of steps) {
    if (!hasIncoming.has(s.localId) && !s.dependsOn) transitions.push({ from: null, to: s.localId });
  }
  const mod: IRModule = { id: 'main', name: 'Observed flow', order: 1, steps: irSteps, transitions };
  const ir: ProcessIR = {
    ir_version: '1.0',
    process_id: processId,
    version: 1,
    outcome: { statement: 'Observed current operating model (compiled from imported event data)', kpis: [] },
    modules: [mod],
    policies: [],
    metrics: [{ name: 'avg_cycle_time_hours', source: 'events' }],
    governance: { audit_level: 'full', approval_points: steps.filter((s) => s.requiresApproval).map((s) => s.localId) },
  };
  const errors = validateIR(ir);
  if (errors.length > 0) throw new Error(`observed IR invalid: ${errors.join('; ')}`);
  return ir;
}

export type { ProcessIR };
