/**
 * Metrics tests — baseline calculations on a golden fixture with known values.
 *
 * Fixture engineered properties (verified independently):
 * - 6 cases, cycle times [122, 146, 98, 174, 74, 122] h
 * - per-case waiting [97, 121, 73, 149, 49, 97] h
 * - per-case approval waiting [86, 110, 62, 134, 38, 86] h
 * - per-case revisions [3, 5, 2, 3, 1, 4], cost 1550 each
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { importTaskEvents } from '@ghal/ingestion';
import { computeBaseline, getMetric } from '@ghal/metrics';

const { events } = importTaskEvents(readFileSync('tests/fixtures/campaign-launch.csv', 'utf8'));
const baseline = computeBaseline(events);

const closeTo = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

describe('computeBaseline — golden values', () => {
  it('counts 6 cases', () => {
    expect(baseline.caseCount).toBe(6);
    expect(getMetric(baseline, 'case_count')!.kind).toBe('measured');
  });

  it('computes avg and median cycle time', () => {
    expect(closeTo(getMetric(baseline, 'avg_cycle_time_hours')!.value, 736 / 6)).toBe(true);
    expect(closeTo(getMetric(baseline, 'median_cycle_time_hours')!.value, 122)).toBe(true);
  });

  it('computes waiting and approval waiting', () => {
    expect(closeTo(getMetric(baseline, 'avg_waiting_hours')!.value, 586 / 6)).toBe(true);
    expect(closeTo(getMetric(baseline, 'avg_approval_waiting_hours')!.value, 86)).toBe(true);
    expect(closeTo(getMetric(baseline, 'approval_wait_share')!.value, 516 / 586)).toBe(true);
  });

  it('computes rework and cost', () => {
    expect(closeTo(getMetric(baseline, 'avg_revisions_per_case')!.value, 3)).toBe(true);
    expect(closeTo(getMetric(baseline, 'avg_cost_per_case')!.value, 1550)).toBe(true);
  });

  it('labels every aggregate as calculated, never measured/estimated', () => {
    for (const m of baseline.metrics) {
      if (m.name === 'case_count') expect(m.kind).toBe('measured');
      else expect(m.kind).toBe('calculated');
    }
  });

  it('flags small-sample limitations', () => {
    const m = getMetric(baseline, 'avg_cycle_time_hours')!;
    expect(m.limitations.some((l) => l.includes('small sample'))).toBe(true);
  });

  it('computes per-step waiting (client_approval dominates)', () => {
    const step = baseline.perStep.find((s) => s.localId === 'client_approval')!;
    expect(closeTo(step.avgWaitingHours, 70)).toBe(true);
    expect(step.requiresApproval).toBe(true);
    const design = baseline.perStep.find((s) => s.localId === 'design')!;
    expect(closeTo(design.avgRevisions!, 2.5)).toBe(true);
  });

  it('computes per-owner active hours', () => {
    const designer = baseline.perOwner.find((o) => o.ownerRole === 'designer')!;
    expect(closeTo(designer.activeHours, 48)).toBe(true);
  });
});
