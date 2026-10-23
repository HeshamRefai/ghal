/**
 * Ingestion Module — CSV task/event import + validation (Data Readiness).
 *
 * Imports task-event histories for a process, validates them, reports
 * data-quality problems, and states which analyses the data can support.
 * Every imported event carries provenance: source='import', never presented
 * as anything other than user-supplied data.
 */

export interface TaskEvent {
  caseId: string;
  taskId: string;
  /** Local id inside the case (taskId stripped of the "<caseId>-" prefix). */
  localId: string;
  taskName: string;
  ownerRole: string;
  startedAt: Date | null;
  completedAt: Date | null;
  status: string;
  /** Local id of the prerequisite task, or null. */
  dependsOn: string | null;
  approvalStatus: string | null;
  revisionCount: number | null;
  cost: number | null;
  exceptionCategory: string | null;
  provenance: { source: 'import'; importedAt: string; row: number };
}

export interface DataQualityIssue {
  row: number; // 1-based data row (header is row 0)
  field: string;
  code:
    | 'missing_required_field'
    | 'invalid_timestamp'
    | 'end_before_start'
    | 'unknown_dependency'
    | 'invalid_number'
    | 'duplicate_task_id';
  message: string;
}

/** Which analyses the imported data can support. */
export interface AnalysisCapabilities {
  cycleTime: boolean;
  waitingTime: boolean;
  rework: boolean;
  cost: boolean;
  approvals: boolean;
  exceptions: boolean;
}

export interface ImportResult {
  events: TaskEvent[];
  issues: DataQualityIssue[];
  capabilities: AnalysisCapabilities;
  caseCount: number;
}

export const REQUIRED_FIELDS = ['case_id', 'task_id', 'task_name', 'started_at', 'completed_at'] as const;
export const OPTIONAL_FIELDS = [
  'owner_role',
  'status',
  'depends_on',
  'approval_status',
  'revision_count',
  'cost',
  'exception_category',
] as const;

/** Minimal RFC-4180-ish CSV parser (quoted fields, commas, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };
  while (i < text.length) {
    const c = text[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += c;
      i += 1;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (c === ',') {
      pushField();
      i += 1;
      continue;
    }
    if (c === '\n') {
      pushRow();
      i += 1;
      continue;
    }
    if (c === '\r') {
      i += 1;
      continue;
    }
    field += c;
    i += 1;
  }
  if (field.length > 0 || row.length > 0) pushRow();
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

function parseTimestamp(raw: string): Date | null {
  const t = Date.parse(raw);
  return Number.isNaN(t) ? null : new Date(t);
}

function parseNumber(raw: string): number | null {
  if (raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Import and validate a task-event CSV.
 * Rows with invalid required fields are excluded from `events` and reported in `issues`.
 */
export function importTaskEvents(csvText: string, importedAt = new Date().toISOString()): ImportResult {
  const issues: DataQualityIssue[] = [];
  const events: TaskEvent[] = [];
  const table = parseCsv(csvText);
  if (table.length === 0) {
    issues.push({ row: 0, field: '(file)', code: 'missing_required_field', message: 'empty CSV file' });
    return { events, issues, capabilities: noCapabilities(), caseCount: 0 };
  }
  const headers = table[0]!.map((h) => h.trim().toLowerCase());
  const col = (name: string) => headers.indexOf(name);

  for (const req of REQUIRED_FIELDS) {
    if (col(req) === -1) {
      issues.push({ row: 0, field: req, code: 'missing_required_field', message: `required column "${req}" is missing` });
    }
  }
  if (REQUIRED_FIELDS.some((f) => col(f) === -1)) {
    return { events, issues, capabilities: noCapabilities(), caseCount: 0 };
  }

  const seenTaskIds = new Set<string>();
  const dataRows = table.slice(1);
  dataRows.forEach((cells, idx) => {
    const rowNo = idx + 1;
    const get = (name: string) => (col(name) === -1 ? '' : (cells[col(name)] ?? '').trim());

    const caseId = get('case_id');
    const taskId = get('task_id');
    const taskName = get('task_name');
    if (!caseId || !taskId || !taskName) {
      issues.push({ row: rowNo, field: 'case_id/task_id/task_name', code: 'missing_required_field', message: 'row missing case_id, task_id or task_name — excluded' });
      return;
    }
    if (seenTaskIds.has(taskId)) {
      issues.push({ row: rowNo, field: 'task_id', code: 'duplicate_task_id', message: `duplicate task_id "${taskId}" — excluded` });
      return;
    }
    const startedAt = parseTimestamp(get('started_at'));
    const completedAt = parseTimestamp(get('completed_at'));
    if (!startedAt || !completedAt) {
      issues.push({ row: rowNo, field: 'started_at/completed_at', code: 'invalid_timestamp', message: `unparseable timestamp in task "${taskId}" — excluded` });
      return;
    }
    if (completedAt < startedAt) {
      issues.push({ row: rowNo, field: 'completed_at', code: 'end_before_start', message: `completed_at before started_at in task "${taskId}" — excluded` });
      return;
    }
    const revisionRaw = get('revision_count');
    const costRaw = get('cost');
    const revisionCount = revisionRaw === '' ? null : parseNumber(revisionRaw);
    const cost = costRaw === '' ? null : parseNumber(costRaw);
    if (revisionRaw !== '' && revisionCount === null) {
      issues.push({ row: rowNo, field: 'revision_count', code: 'invalid_number', message: `invalid revision_count "${revisionRaw}" — treated as unknown` });
    }
    if (costRaw !== '' && cost === null) {
      issues.push({ row: rowNo, field: 'cost', code: 'invalid_number', message: `invalid cost "${costRaw}" — treated as unknown` });
    }
    seenTaskIds.add(taskId);
    const prefix = `${caseId}-`;
    const localId = taskId.startsWith(prefix) ? taskId.slice(prefix.length) : taskId;
    events.push({
      caseId,
      taskId,
      localId,
      taskName,
      ownerRole: get('owner_role'),
      startedAt,
      completedAt,
      status: get('status') || 'unknown',
      dependsOn: get('depends_on') || null,
      approvalStatus: get('approval_status') || null,
      revisionCount,
      cost,
      exceptionCategory: get('exception_category') || null,
      provenance: { source: 'import', importedAt, row: rowNo },
    });
  });

  // Dependency integrity (checked per case, after parsing).
  const byCase = new Map<string, Set<string>>();
  for (const e of events) {
    if (!byCase.has(e.caseId)) byCase.set(e.caseId, new Set());
    byCase.get(e.caseId)!.add(e.localId);
  }
  for (const e of events) {
    if (e.dependsOn && !byCase.get(e.caseId)!.has(e.dependsOn)) {
      issues.push({
        row: e.provenance.row,
        field: 'depends_on',
        code: 'unknown_dependency',
        message: `task "${e.taskId}" depends on unknown task "${e.dependsOn}" — dependency ignored`,
      });
      e.dependsOn = null;
    }
  }

  const withTs = events.filter((e) => e.startedAt && e.completedAt);
  const capabilities: AnalysisCapabilities = {
    cycleTime: withTs.length > 0,
    waitingTime: withTs.some((e) => e.dependsOn !== null),
    rework: events.some((e) => e.revisionCount !== null),
    cost: events.some((e) => e.cost !== null),
    approvals: events.some((e) => e.approvalStatus !== null),
    exceptions: events.some((e) => e.exceptionCategory !== null),
  };
  return { events, issues, capabilities, caseCount: new Set(events.map((e) => e.caseId)).size };
}

function noCapabilities(): AnalysisCapabilities {
  return { cycleTime: false, waitingTime: false, rework: false, cost: false, approvals: false, exceptions: false };
}
