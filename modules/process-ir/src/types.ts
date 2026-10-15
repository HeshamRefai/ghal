/**
 * Process IR — Intermediate Representation
 * Properties: Versioned, Validatable, Simulatable, Governable, Executable, Auditable, Evolvable.
 */
export const IR_VERSION = '1.0' as const;

export type ActorType = 'human' | 'agent' | 'system';
export type AutonomyLevel = 'ALLOW' | 'SUPERVISED' | 'APPROVAL_REQUIRED' | 'ESCALATE' | 'BLOCK';
export type StepType = 'step' | 'decision' | 'approval';
export type RiskLevel = 'low' | 'med' | 'high';

export interface IROutcomeKpi {
  name: string; target: number; unit: string;
}

export interface IROutcome {
  statement: string;
  kpis: IROutcomeKpi[];
}

export interface IRStep {
  id: string;
  type: StepType;
  name: string;
  actor: { type: ActorType; ref: string };
  autonomy: AutonomyLevel;
  inputs: string[];
  outputs: string[];
  evidence_required: string[];
  parameters: Record<string, unknown>;
  risk: { level: RiskLevel; reversibility: boolean };
  exceptions: Array<{ on: string; route: 'escalate' | 'retry' | 'human' | 'compensate' }>;
}

export interface IRTransition {
  from: string | null;
  to: string;
  condition_param?: string;
}

export interface IRModule {
  id: string;
  name: string;
  order: number;
  steps: IRStep[];
  transitions: IRTransition[];
}

export interface ProcessIR {
  ir_version: typeof IR_VERSION;
  process_id: string;
  version: number;
  outcome: IROutcome;
  modules: IRModule[];
  policies: Array<{ ref: string; rules: string[] }>;
  metrics: Array<{ name: string; source: 'events' }>;
  governance: { audit_level: 'full'; approval_points: string[] };
}

export function validateIR(ir: ProcessIR): string[] {
  const errors: string[] = [];
  if (ir.ir_version !== IR_VERSION) errors.push(`ir_version must be ${IR_VERSION}`);
  if (ir.version < 1) errors.push('version must be >= 1');
  if (!ir.outcome.statement.trim()) errors.push('outcome.statement required (Outcome-First)');
  const stepIds = new Set<string>();
  const dup = (id: string) => { if (stepIds.has(id)) errors.push(`duplicate step id: ${id}`); stepIds.add(id); };
  ir.modules.forEach((m) => {
    m.steps.forEach((s) => {
      dup(s.id);
      if (s.type === 'approval' && s.autonomy === 'ALLOW')
        errors.push(`approval step ${s.id} cannot have autonomy ALLOW`);
      if (s.risk.level === 'high' && s.autonomy === 'ALLOW')
        errors.push(`high-risk step ${s.id} cannot be ALLOW (Policy)`);
    });
    m.transitions.forEach((t) => {
      if (t.from !== null && !stepIds.has(t.from)) errors.push(`transition from unknown step ${t.from}`);
      if (!stepIds.has(t.to)) errors.push(`transition to unknown step ${t.to}`);
    });
  });
  const entryCount = ir.modules.reduce((n, m) => n + m.transitions.filter((t) => t.from === null).length, 0);
  if (entryCount === 0) errors.push('no entry transition');
  return errors;
}
