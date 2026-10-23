/**
 * Diagnostics tests — known fixture must yield known findings with evidence.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { importTaskEvents } from '@ghal/ingestion';
import { computeBaseline } from '@ghal/metrics';
import { detectFindings } from '@ghal/diagnostics';

const { events } = importTaskEvents(readFileSync('tests/fixtures/campaign-launch.csv', 'utf8'));
const baseline = computeBaseline(events);
const findings = detectFindings(events, baseline);

describe('detectFindings — golden fixture', () => {
  it('detects the engineered approval bottleneck with evidence', () => {
    const f = findings.find((x) => x.type === 'approval_bottleneck');
    expect(f).toBeDefined();
    expect(f!.affectedSteps).toContain('client_approval');
    // client_approval waits ≥24h in every case except CAMP-005 (22h)
    expect(f!.evidence.caseIds).toHaveLength(5);
    expect(f!.evidence.caseIds).not.toContain('CAMP-005');
    expect(f!.evidence.values['approval_wait_share']).toBeCloseTo(516 / 586, 3);
    expect(f!.evidence.values['avg_wait_hours:client_approval']).toBeCloseTo(70, 3);
  });

  it('detects the engineered rework loop at design', () => {
    const f = findings.find((x) => x.type === 'rework_loop');
    expect(f).toBeDefined();
    expect(f!.affectedSteps).toContain('design');
    expect(f!.evidence.values['avg_revisions:design']).toBeCloseTo(2.5, 3);
  });

  it('detects unbalanced workload for the designer role', () => {
    const f = findings.find((x) => x.type === 'unbalanced_workload' && x.id.includes('designer'));
    expect(f).toBeDefined();
    expect(f!.evidence.values['active_hours']).toBeCloseTo(48, 3);
  });

  it('does not flag unclear ownership (all tasks have owners)', () => {
    expect(findings.some((x) => x.type === 'unclear_ownership')).toBe(false);
  });

  it('attaches calculation, confidence < 1, and limitations to every finding', () => {
    for (const f of findings) {
      expect(f.calculation.length).toBeGreaterThan(10);
      expect(f.confidence).toBeGreaterThan(0);
      expect(f.confidence).toBeLessThan(1);
      expect(f.limitations.length).toBeGreaterThan(0);
      expect(f.evidence.caseIds.length).toBeGreaterThan(0);
    }
  });

  it('finds nothing in a healthy process', () => {
    const csv = [
      'case_id,task_id,task_name,owner_role,started_at,completed_at,depends_on,approval_status,revision_count',
      'C1,C1-a,A,role1,2026-01-01T09:00:00,2026-01-01T11:00:00,,,0',
      'C1,C1-b,B,role2,2026-01-01T11:00:00,2026-01-01T13:00:00,a,,0',
      'C2,C2-a,A,role1,2026-01-02T09:00:00,2026-01-02T11:00:00,,,0',
      'C2,C2-b,B,role2,2026-01-02T11:00:00,2026-01-02T13:00:00,a,,0',
    ].join('\n');
    const { events: healthy } = importTaskEvents(csv);
    const b = computeBaseline(healthy);
    expect(detectFindings(healthy, b)).toEqual([]);
  });
});
