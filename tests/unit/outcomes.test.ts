/**
 * Outcomes tests — measured before/after comparison.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { importTaskEvents } from '@ghal/ingestion';
import { computeBaseline } from '@ghal/metrics';
import { compareWithBaseline } from '@ghal/outcomes';

const { events } = importTaskEvents(readFileSync('tests/fixtures/campaign-launch.csv', 'utf8'));
const baseline = computeBaseline(events);
const OUTCOME_CSV = readFileSync('tests/fixtures/campaign-launch-outcomes.csv', 'utf8');

describe('compareWithBaseline', () => {
  const outcomeEvents = importTaskEvents(OUTCOME_CSV).events;
  const cmp = compareWithBaseline(baseline, outcomeEvents, '2026-10-23T00:00:00Z');

  it('reports improved cycle time (122.67h → 54h avg)', () => {
    const c = cmp.comparisons.find((x) => x.metric === 'avg_cycle_time_hours')!;
    expect(c.baselineValue).toBeCloseTo(736 / 6, 3);
    expect(c.observedValue).toBeCloseTo(54, 3);
    expect(c.direction).toBe('improved');
    expect(c.kind).toBe('calculated_from_measured');
    expect(c.sampleSize).toEqual({ baseline: 6, observed: 2 });
  });

  it('reports improved approval waiting (86h → 18h avg)', () => {
    const c = cmp.comparisons.find((x) => x.metric === 'avg_approval_waiting_hours')!;
    // per-case approval waiting: brief_review 0 + internal_review 16 + client_approval 2 = 18
    expect(c.baselineValue).toBeCloseTo(86, 3);
    expect(c.observedValue).toBeCloseTo(18, 3);
    expect(c.direction).toBe('improved');
  });

  it('reports improved rework (3 → 1 revisions/case)', () => {
    const c = cmp.comparisons.find((x) => x.metric === 'avg_revisions_per_case')!;
    expect(c.direction).toBe('improved');
    expect(c.observedValue).toBeCloseTo(1, 3);
  });

  it('always states confounders — never claims causation', () => {
    expect(cmp.confounders.length).toBeGreaterThan(0);
    expect(cmp.summary).toContain('not proof of causation');
    expect(cmp.limitations.some((l) => l.includes('2 post-change cases'))).toBe(true);
  });

  it('handles missing overlap honestly', () => {
    const csv = 'case_id,task_id,task_name,started_at,completed_at\nX,X-a,A,2026-10-01T09:00:00,2026-10-01T10:00:00';
    const bare = importTaskEvents(csv).events;
    const c2 = compareWithBaseline(baseline, bare);
    // no revisions/cost columns → those metrics are not compared
    expect(c2.comparisons.some((c) => c.metric === 'avg_revisions_per_case')).toBe(false);
    expect(c2.comparisons.some((c) => c.metric === 'avg_cycle_time_hours')).toBe(true);
  });
});
