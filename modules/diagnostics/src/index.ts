/**
 * Diagnostics Module — evidence-linked bottleneck detection.
 *
 * Every finding carries the data it was computed from (affected cases and
 * values), the calculation that produced it, a confidence bounded by sample
 * size, and explicit limitations. Correlation is never presented as causation.
 */
import type { TaskEvent } from '@ghal/ingestion';
import type { Baseline } from '@ghal/metrics';
import { waitingHours } from '@ghal/metrics';

export type FindingType =
  | 'approval_bottleneck'
  | 'waiting_bottleneck'
  | 'rework_loop'
  | 'unbalanced_workload'
  | 'unclear_ownership';

export interface Finding {
  id: string;
  type: FindingType;
  title: string;
  summary: string;
  affectedSteps: string[];
  evidence: {
    caseIds: string[];
    values: Record<string, number>;
  };
  /** Human-readable description of how the numbers were computed. */
  calculation: string;
  confidence: number; // 0..1, bounded by sample size — never 1
  limitations: string[];
}

export interface DiagnosticRules {
  /** Approval step avg waiting must exceed this many hours. Default 24. */
  approvalWaitHoursThreshold: number;
  /** …and represent at least this share of all waiting. Default 0.3. */
  approvalWaitShareThreshold: number;
  /** Any step avg waiting above this is a waiting bottleneck. Default 24. */
  stepWaitHoursThreshold: number;
  /** Avg revisions per case on a step at or above this = rework loop. Default 2. */
  revisionThreshold: number;
  /** Owner active hours >= mean × this factor = unbalanced. Default 1.5. */
  workloadImbalanceFactor: number;
}

export const DEFAULT_RULES: DiagnosticRules = {
  approvalWaitHoursThreshold: 24,
  approvalWaitShareThreshold: 0.3,
  stepWaitHoursThreshold: 24,
  revisionThreshold: 2,
  workloadImbalanceFactor: 1.5,
};

function confidenceFor(caseCount: number): number {
  // Bounded heuristic: more observed cases → higher confidence, never certain.
  return Math.min(0.95, 0.4 + 0.1 * caseCount);
}

export function detectFindings(
  events: TaskEvent[],
  baseline: Baseline,
  rules: DiagnosticRules = DEFAULT_RULES,
): Finding[] {
  const findings: Finding[] = [];
  const confidence = confidenceFor(baseline.caseCount);
  const sampleLimitation =
    baseline.caseCount < 10 ? [`only ${baseline.caseCount} cases observed — findings are indicative`] : [];

  const totalWait = baseline.perCase.reduce((a, c) => a + c.waitingHours, 0);
  const totalApprWait = baseline.perCase.reduce((a, c) => a + c.approvalWaitingHours, 0);
  const approvalShare = totalWait === 0 ? 0 : totalApprWait / totalWait;

  // 1. Approval bottleneck: approval steps dominate waiting.
  const apprSteps = baseline.perStep.filter((s) => s.requiresApproval && s.avgWaitingHours >= rules.approvalWaitHoursThreshold);
  if (apprSteps.length > 0 && approvalShare >= rules.approvalWaitShareThreshold) {
    const worst = [...apprSteps].sort((a, b) => b.avgWaitingHours - a.avgWaitingHours)[0]!;
    const caseIds = casesWithLongWait(events, worst.localId, rules.approvalWaitHoursThreshold);
    findings.push({
      id: `finding-approval-bottleneck-${worst.localId}`,
      type: 'approval_bottleneck',
      title: `Approval bottleneck at "${worst.taskName}"`,
      summary:
        `Approval-required steps account for ${(approvalShare * 100).toFixed(1)}% of all waiting time. ` +
        `"${worst.taskName}" alone waits ${worst.avgWaitingHours.toFixed(1)}h on average before work begins.`,
      affectedSteps: apprSteps.map((s) => s.localId),
      evidence: {
        caseIds,
        values: {
          approval_wait_share: round4(approvalShare),
          [`avg_wait_hours:${worst.localId}`]: round4(worst.avgWaitingHours),
          total_waiting_hours: round4(totalWait),
          approval_waiting_hours: round4(totalApprWait),
        },
      },
      calculation:
        'waiting(task) = max(0, started_at − completed_at(dependency)); ' +
        'approval share = Σ waiting of approval steps ÷ Σ all waiting; ' +
        `flags when step avg wait ≥ ${rules.approvalWaitHoursThreshold}h and share ≥ ${rules.approvalWaitShareThreshold}.`,
      confidence,
      limitations: [
        ...sampleLimitation,
        'waiting is measured between dependency completion and task start; the cause of the wait (client, calendar, staffing) is not observable from timestamps alone',
        'correlation between approval steps and delay does not prove the approval itself is the cause',
      ],
    });
  }

  // 2. Waiting bottleneck at non-approval steps.
  const waitSteps = baseline.perStep.filter(
    (s) => !s.requiresApproval && s.avgWaitingHours >= rules.stepWaitHoursThreshold && s.occurrences >= 2,
  );
  for (const s of waitSteps) {
    findings.push({
      id: `finding-waiting-bottleneck-${s.localId}`,
      type: 'waiting_bottleneck',
      title: `Waiting bottleneck before "${s.taskName}"`,
      summary: `"${s.taskName}" waits ${s.avgWaitingHours.toFixed(1)}h on average after its prerequisite completes.`,
      affectedSteps: [s.localId],
      evidence: { caseIds: casesWithLongWait(events, s.localId, rules.stepWaitHoursThreshold), values: { [`avg_wait_hours:${s.localId}`]: round4(s.avgWaitingHours) } },
      calculation: `avg over ${s.occurrences} occurrences of max(0, started_at − completed_at(dependency)); threshold ${rules.stepWaitHoursThreshold}h.`,
      confidence,
      limitations: [...sampleLimitation, 'waiting may be caused by scheduling, capacity, or upstream quality — timestamps alone cannot distinguish these'],
    });
  }

  // 3. Rework loop.
  const revSteps = baseline.perStep.filter((s) => s.avgRevisions !== null && s.avgRevisions >= rules.revisionThreshold);
  for (const s of revSteps) {
    findings.push({
      id: `finding-rework-loop-${s.localId}`,
      type: 'rework_loop',
      title: `Rework loop at "${s.taskName}"`,
      summary: `"${s.taskName}" averages ${s.avgRevisions!.toFixed(2)} revisions per case (threshold ${rules.revisionThreshold}).`,
      affectedSteps: [s.localId],
      evidence: {
        caseIds: casesForStep(events, s.localId),
        values: { [`avg_revisions:${s.localId}`]: round4(s.avgRevisions!) },
      },
      calculation: `avg of reported revision_count over ${s.occurrences} occurrences of step "${s.localId}".`,
      confidence,
      limitations: [...sampleLimitation, 'revision_count is self-reported in the import; causes of revisions (brief quality, client changes) are not observable from this field alone'],
    });
  }

  // 4. Unbalanced workload.
  const owners = baseline.perOwner.filter((o) => o.ownerRole !== '(unassigned)');
  if (owners.length >= 2) {
    const avg = owners.reduce((a, o) => a + o.activeHours, 0) / owners.length;
    for (const o of owners) {
      if (o.activeHours >= avg * rules.workloadImbalanceFactor) {
        findings.push({
          id: `finding-unbalanced-workload-${o.ownerRole}`,
          type: 'unbalanced_workload',
          title: `Unbalanced workload: ${o.ownerRole}`,
          summary: `${o.ownerRole} carries ${o.activeHours.toFixed(1)}h active work vs ${avg.toFixed(1)}h average per role (≥ ${rules.workloadImbalanceFactor}× mean).`,
          affectedSteps: [],
          evidence: { caseIds: [...new Set(events.filter((e) => e.ownerRole === o.ownerRole).map((e) => e.caseId))], values: { active_hours: round4(o.activeHours), mean_active_hours: round4(avg) } },
          calculation: `active hours per owner = Σ(completed_at − started_at) of owned tasks; flagged at ≥ ${rules.workloadImbalanceFactor}× mean across ${owners.length} roles.`,
          confidence,
          limitations: [...sampleLimitation, 'active hours measure task duration, not effort intensity; role mix may justify some imbalance'],
        });
      }
    }
  }

  // 5. Unclear ownership.
  const unassigned = events.filter((e) => !e.ownerRole);
  if (unassigned.length > 0) {
    findings.push({
      id: 'finding-unclear-ownership',
      type: 'unclear_ownership',
      title: 'Tasks without an owner',
      summary: `${unassigned.length} imported tasks have no owner_role.`,
      affectedSteps: [...new Set(unassigned.map((e) => e.localId))],
      evidence: { caseIds: [...new Set(unassigned.map((e) => e.caseId))], values: { unassigned_tasks: unassigned.length } },
      calculation: 'count of imported tasks with empty owner_role.',
      confidence: Math.min(0.95, 0.6 + 0.05 * unassigned.length),
      limitations: ['owner_role may simply be missing from the export rather than genuinely unassigned — verify with the data source'],
    });
  }

  return findings;
}

function casesWithLongWait(events: TaskEvent[], localId: string, threshold: number): string[] {
  const out: string[] = [];
  const byCase = groupByCase(events);
  for (const [caseId, rs] of byCase) {
    const byLocalId = new Map(rs.map((r) => [r.localId, r]));
    const t = byLocalId.get(localId);
    if (t && waitingHours(t, byLocalId) >= threshold) out.push(caseId);
  }
  return out;
}

function casesForStep(events: TaskEvent[], localId: string): string[] {
  return [...new Set(events.filter((e) => e.localId === localId).map((e) => e.caseId))];
}

function groupByCase(events: TaskEvent[]): Map<string, TaskEvent[]> {
  const m = new Map<string, TaskEvent[]>();
  for (const e of events) {
    if (!m.has(e.caseId)) m.set(e.caseId, []);
    m.get(e.caseId)!.push(e);
  }
  return m;
}

const round4 = (n: number) => Math.round(n * 10000) / 10000;
