/**
 * Ingestion tests — CSV import, validation, capability reporting.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { importTaskEvents, parseCsv } from '@ghal/ingestion';

const fixture = readFileSync('tests/fixtures/campaign-launch.csv', 'utf8');

describe('CSV parser', () => {
  it('parses quoted fields, commas and CRLF', () => {
    const rows = parseCsv('a,b\r\n"x, y","he said ""hi"""\r\n1,2\n');
    expect(rows).toEqual([
      ['a', 'b'],
      ['x, y', 'he said "hi"'],
      ['1', '2'],
    ]);
  });
});

describe('importTaskEvents — golden fixture', () => {
  it('imports all 42 events across 6 cases with no issues', () => {
    const r = importTaskEvents(fixture);
    expect(r.issues).toEqual([]);
    expect(r.events).toHaveLength(42);
    expect(r.caseCount).toBe(6);
  });

  it('reports full analysis capabilities for complete data', () => {
    const r = importTaskEvents(fixture);
    expect(r.capabilities).toEqual({
      cycleTime: true,
      waitingTime: true,
      rework: true,
      cost: true,
      approvals: true,
      exceptions: false, // no exception_category values in the fixture
    });
  });

  it('strips the case prefix into localId and tags provenance', () => {
    const r = importTaskEvents(fixture);
    const e = r.events.find((x) => x.taskId === 'CAMP-001-design')!;
    expect(e.localId).toBe('design');
    expect(e.provenance.source).toBe('import');
    expect(e.provenance.row).toBeGreaterThan(0);
  });
});

describe('importTaskEvents — data quality', () => {
  it('rejects a file missing a required column', () => {
    const r = importTaskEvents('case_id,task_id\nC1,T1\n');
    expect(r.events).toHaveLength(0);
    expect(r.issues.some((i) => i.code === 'missing_required_field')).toBe(true);
  });

  it('excludes rows with unparseable timestamps', () => {
    const csv = [
      'case_id,task_id,task_name,started_at,completed_at',
      'C1,C1-a,A,2026-01-01T09:00:00,not-a-date',
      'C1,C1-b,B,2026-01-01T09:00:00,2026-01-01T10:00:00',
    ].join('\n');
    const r = importTaskEvents(csv);
    expect(r.events.map((e) => e.localId)).toEqual(['C1-b'].map((s) => s.slice(3)));
    expect(r.issues.filter((i) => i.code === 'invalid_timestamp')).toHaveLength(1);
  });

  it('excludes rows where completed_at < started_at', () => {
    const csv = [
      'case_id,task_id,task_name,started_at,completed_at',
      'C1,C1-a,A,2026-01-02T09:00:00,2026-01-01T09:00:00',
    ].join('\n');
    const r = importTaskEvents(csv);
    expect(r.events).toHaveLength(0);
    expect(r.issues[0]!.code).toBe('end_before_start');
  });

  it('nulls unknown dependencies and reports them', () => {
    const csv = [
      'case_id,task_id,task_name,started_at,completed_at,depends_on',
      'C1,C1-a,A,2026-01-01T09:00:00,2026-01-01T10:00:00,ghost',
    ].join('\n');
    const r = importTaskEvents(csv);
    expect(r.events[0]!.dependsOn).toBeNull();
    expect(r.issues.some((i) => i.code === 'unknown_dependency')).toBe(true);
  });

  it('reports invalid numbers but keeps the row with the field unknown', () => {
    const csv = [
      'case_id,task_id,task_name,started_at,completed_at,revision_count,cost',
      'C1,C1-a,A,2026-01-01T09:00:00,2026-01-01T10:00:00,many,free',
    ].join('\n');
    const r = importTaskEvents(csv);
    expect(r.events).toHaveLength(1);
    expect(r.events[0]!.revisionCount).toBeNull();
    expect(r.events[0]!.cost).toBeNull();
    expect(r.issues.filter((i) => i.code === 'invalid_number')).toHaveLength(2);
  });

  it('marks capabilities false when columns carry no data', () => {
    const csv = [
      'case_id,task_id,task_name,started_at,completed_at',
      'C1,C1-a,A,2026-01-01T09:00:00,2026-01-01T10:00:00',
    ].join('\n');
    const r = importTaskEvents(csv);
    expect(r.capabilities.rework).toBe(false);
    expect(r.capabilities.cost).toBe(false);
    expect(r.capabilities.waitingTime).toBe(false);
    expect(r.capabilities.cycleTime).toBe(true);
  });
});
