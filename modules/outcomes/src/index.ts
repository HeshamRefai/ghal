/**
 * Outcomes Module — measured before/after comparison.
 *
 * Compares a stored baseline (calculated from pre-change events) against a
 * post-change observation set (measured events). Both sides are labeled:
 * baseline values are 'calculated', observed values are 'measured'/'calculated'
 * from measured events. Differences are never described as causal proof —
 * confounders are listed explicitly.
 */
import type { TaskEvent } from '@ghal/ingestion';
import type { Baseline } from '@ghal/metrics';
import { computeBaseline, getMetric } from '@ghal/metrics';

export interface MetricComparison {
  metric: string;
  unit: string;
  baselineValue: number;
  observedValue: number;
  delta: number;
  deltaPct: number | null;
  /** 'improved' assumes lower is better for time/cost/revision metrics. */
  direction: 'improved' | 'regressed' | 'unchanged' | 'unknown';
  kind: 'calculated_from_measured';
  sampleSize: { baseline: number; observed: number };
}

export interface Comparison {
  baselineComputedAt: string;
  observedComputedAt: string;
  comparisons: MetricComparison[];
  confounders: string[];
  limitations: string[];
  /** Plain-language, data-only summary — no AI success statements. */
  summary: string;
}

/** Metrics where lower is better. */
const LOWER_IS_BETTER = new Set([
  'avg_cycle_time_hours',
  'median_cycle_time_hours',
  'avg_waiting_hours',
  'avg_approval_waiting_hours',
  'approval_wait_share',
  'avg_revisions_per_case',
  'avg_cost_per_case',
]);

const COMPARE_METRICS = [
  'avg_cycle_time_hours',
  'avg_waiting_hours',
  'avg_approval_waiting_hours',
  'avg_revisions_per_case',
  'avg_cost_per_case',
];

export function compareWithBaseline(
  baseline: Baseline,
  outcomeEvents: TaskEvent[],
  observedComputedAt = new Date().toISOString(),
): Comparison {
  const observed = computeBaseline(outcomeEvents, observedComputedAt);
  const comparisons: MetricComparison[] = [];

  for (const name of COMPARE_METRICS) {
    const b = getMetric(baseline, name);
    const o = getMetric(observed, name);
    if (!b || !o) continue;
    const delta = o.value - b.value;
    const deltaPct = b.value === 0 ? null : delta / b.value;
    let direction: MetricComparison['direction'] = 'unknown';
    if (LOWER_IS_BETTER.has(name)) {
      const eps = Math.abs(b.value) * 0.001 + 1e-9;
      direction = delta < -eps ? 'improved' : delta > eps ? 'regressed' : 'unchanged';
    }
    comparisons.push({
      metric: name,
      unit: b.unit,
      baselineValue: b.value,
      observedValue: o.value,
      delta,
      deltaPct,
      direction,
      kind: 'calculated_from_measured',
      sampleSize: { baseline: b.sampleSize, observed: o.sampleSize },
    });
  }

  const limitations: string[] = [];
  if (observed.caseCount < 5) limitations.push(`only ${observed.caseCount} post-change cases observed — conclusions are weak`);
  const confounders = [
    'pre and post periods may differ in case mix, client, seasonality, or staffing — the comparison is not a controlled experiment',
    'no randomization: the change under test coincides with everything else that changed in the period',
  ];

  const improved = comparisons.filter((c) => c.direction === 'improved').length;
  const regressed = comparisons.filter((c) => c.direction === 'regressed').length;
  const summary =
    comparisons.length === 0
      ? 'No comparable metrics: post-change data does not overlap with baseline metrics.'
      : `${comparisons.length} metrics compared: ${improved} improved, ${regressed} regressed, ${comparisons.length - improved - regressed} unchanged/unknown. ` +
        'This is an observed association, not proof of causation.';

  return { baselineComputedAt: baseline.computedAt, observedComputedAt, comparisons, confounders, limitations, summary };
}
