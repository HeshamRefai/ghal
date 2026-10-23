/**
 * Metrics Module — deterministic baseline calculation from task events.
 *
 * Definitions (documented so results are reproducible):
 * - cycle time (case)     = last completed_at - first started_at, in hours.
 * - waiting (task)        = max(0, started_at - completed_at(depends_on)).
 *                           Tasks without a dependency contribute 0.
 * - approval waiting      = waiting of tasks that have an approval_status.
 * - active work (task)    = completed_at - started_at.
 * - rework                = sum of revision_count (only where reported).
 *
 * Raw timestamps are 'measured' (imported observations); every aggregate
 * produced here is 'calculated'. Nothing here is an estimate or a simulation.
 */
import type { TaskEvent } from '@ghal/ingestion';

export type MetricKind = 'measured' | 'calculated';

export interface MetricValue {
  name: string;
  value: number;
  unit: string;
  kind: MetricKind;
  sampleSize: number;
  limitations: string[];
}

export interface StepStat {
  localId: string;
  taskName: string;
  avgWaitingHours: number;
  avgActiveHours: number;
  avgRevisions: number | null;
  occurrences: number;
  requiresApproval: boolean;
}

export interface OwnerStat {
  ownerRole: string;
  activeHours: number;
  taskCount: number;
}

export interface CaseMetric {
  caseId: string;
  cycleTimeHours: number;
  waitingHours: number;
  approvalWaitingHours: number;
  activeHours: number;
  revisions: number | null;
  cost: number | null;
}

export interface Baseline {
  computedAt: string;
  caseCount: number;
  metrics: MetricValue[];
  perCase: CaseMetric[];
  perStep: StepStat[];
  perOwner: OwnerStat[];
}

const hours = (a: Date, b: Date) => (b.getTime() - a.getTime()) / 3_600_000;
const mean = (xs: number[]) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export function waitingHours(task: TaskEvent, byLocalId: Map<string, TaskEvent>): number {
  if (!task.dependsOn || !task.startedAt) return 0;
  const dep = byLocalId.get(task.dependsOn);
  if (!dep || !dep.completedAt) return 0;
  return Math.max(0, hours(dep.completedAt, task.startedAt));
}

export function computeBaseline(events: TaskEvent[], computedAt = new Date().toISOString()): Baseline {
  const byCase = new Map<string, TaskEvent[]>();
  for (const e of events) {
    if (!byCase.has(e.caseId)) byCase.set(e.caseId, []);
    byCase.get(e.caseId)!.push(e);
  }

  const perCase: CaseMetric[] = [];
  for (const [caseId, rs] of byCase) {
    const timed = rs.filter((r) => r.startedAt && r.completedAt);
    if (timed.length === 0) continue;
    const byLocalId = new Map(rs.map((r) => [r.localId, r]));
    const start = new Date(Math.min(...timed.map((r) => r.startedAt!.getTime())));
    const end = new Date(Math.max(...timed.map((r) => r.completedAt!.getTime())));
    let waiting = 0;
    let approvalWaiting = 0;
    let active = 0;
    for (const r of timed) {
      const w = waitingHours(r, byLocalId);
      waiting += w;
      if (r.approvalStatus) approvalWaiting += w;
      active += hours(r.startedAt!, r.completedAt!);
    }
    const revs = rs.map((r) => r.revisionCount).filter((v): v is number => v !== null);
    const costs = rs.map((r) => r.cost).filter((v): v is number => v !== null);
    perCase.push({
      caseId,
      cycleTimeHours: hours(start, end),
      waitingHours: waiting,
      approvalWaitingHours: approvalWaiting,
      activeHours: active,
      revisions: revs.length > 0 ? revs.reduce((a, b) => a + b, 0) : null,
      cost: costs.length > 0 ? costs.reduce((a, b) => a + b, 0) : null,
    });
  }

  const cycles = perCase.map((c) => c.cycleTimeHours);
  const waits = perCase.map((c) => c.waitingHours);
  const apprWaits = perCase.map((c) => c.approvalWaitingHours);
  const revCases = perCase.filter((c) => c.revisions !== null);
  const costCases = perCase.filter((c) => c.cost !== null);
  const totalWait = waits.reduce((a, b) => a + b, 0);
  const totalApprWait = apprWaits.reduce((a, b) => a + b, 0);

  const limitations: string[] = [];
  if (perCase.length < 10) limitations.push(`small sample (${perCase.length} cases) — treat aggregates as indicative, not stable`);
  if (revCases.length < perCase.length) limitations.push('revision data incomplete — rework metrics cover only cases that report revisions');
  if (costCases.length < perCase.length) limitations.push('cost data incomplete — cost metrics cover only cases that report cost');

  const metrics: MetricValue[] = [
    { name: 'case_count', value: perCase.length, unit: 'cases', kind: 'measured', sampleSize: perCase.length, limitations },
    { name: 'avg_cycle_time_hours', value: mean(cycles), unit: 'hours', kind: 'calculated', sampleSize: perCase.length, limitations },
    { name: 'median_cycle_time_hours', value: median(cycles), unit: 'hours', kind: 'calculated', sampleSize: perCase.length, limitations },
    { name: 'avg_waiting_hours', value: mean(waits), unit: 'hours', kind: 'calculated', sampleSize: perCase.length, limitations },
    { name: 'avg_approval_waiting_hours', value: mean(apprWaits), unit: 'hours', kind: 'calculated', sampleSize: perCase.length, limitations },
    {
      name: 'approval_wait_share',
      value: totalWait === 0 ? 0 : totalApprWait / totalWait,
      unit: 'ratio',
      kind: 'calculated',
      sampleSize: perCase.length,
      limitations,
    },
    { name: 'avg_active_hours', value: mean(perCase.map((c) => c.activeHours)), unit: 'hours', kind: 'calculated', sampleSize: perCase.length, limitations },
  ];
  if (revCases.length > 0) {
    metrics.push({ name: 'avg_revisions_per_case', value: mean(revCases.map((c) => c.revisions!)), unit: 'revisions', kind: 'calculated', sampleSize: revCases.length, limitations });
  }
  if (costCases.length > 0) {
    metrics.push({ name: 'avg_cost_per_case', value: mean(costCases.map((c) => c.cost!)), unit: 'cost_units', kind: 'calculated', sampleSize: costCases.length, limitations });
  }

  // Per-step statistics (aggregated across cases by local task id).
  const stepMap = new Map<string, { name: string; waits: number[]; actives: number[]; revs: number[]; approval: boolean }>();
  for (const rs of byCase.values()) {
    const byLocalId = new Map(rs.map((r) => [r.localId, r]));
    for (const r of rs) {
      if (!r.startedAt || !r.completedAt) continue;
      if (!stepMap.has(r.localId)) stepMap.set(r.localId, { name: r.taskName, waits: [], actives: [], revs: [], approval: false });
      const s = stepMap.get(r.localId)!;
      s.waits.push(waitingHours(r, byLocalId));
      s.actives.push(hours(r.startedAt, r.completedAt));
      if (r.revisionCount !== null) s.revs.push(r.revisionCount);
      if (r.approvalStatus) s.approval = true;
    }
  }
  const perStep: StepStat[] = [...stepMap.entries()].map(([localId, s]) => ({
    localId,
    taskName: s.name,
    avgWaitingHours: mean(s.waits),
    avgActiveHours: mean(s.actives),
    avgRevisions: s.revs.length > 0 ? mean(s.revs) : null,
    occurrences: s.waits.length,
    requiresApproval: s.approval,
  }));

  const ownerMap = new Map<string, { active: number; count: number }>();
  for (const r of events) {
    if (!r.startedAt || !r.completedAt) continue;
    const key = r.ownerRole || '(unassigned)';
    if (!ownerMap.has(key)) ownerMap.set(key, { active: 0, count: 0 });
    const o = ownerMap.get(key)!;
    o.active += hours(r.startedAt, r.completedAt);
    o.count += 1;
  }
  const perOwner: OwnerStat[] = [...ownerMap.entries()].map(([ownerRole, o]) => ({ ownerRole, activeHours: o.active, taskCount: o.count }));

  return { computedAt, caseCount: perCase.length, metrics, perCase, perStep, perOwner };
}

export function getMetric(b: Baseline, name: string): MetricValue | undefined {
  return b.metrics.find((m) => m.name === name);
}
