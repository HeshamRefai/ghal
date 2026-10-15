/**
 * Process Execution Runtime
 * Executes Process IR step by step, pins Case to its version, writes Events.
 */
import type { ProcessIR, IRStep, AutonomyLevel } from '@ghal/process-ir';

export interface ExecutionContext {
  tenantId: string;
  caseId: string;
  processVersionId: string;
  parameters: Record<string, unknown>;
}

export interface StepHandler {
  execute(step: IRStep, ctx: ExecutionContext): Promise<StepResult>;
}

export interface StepResult {
  output: Record<string, unknown>;
  evidence: string[];
  confidence?: number;
}

export interface RuntimeEvent {
  type: string;
  stepId?: string;
  payload: Record<string, unknown>;
}

export interface RuntimeDeps {
  emit: (e: RuntimeEvent) => Promise<void>;
  requestAuthorization: (step: IRStep, ctx: ExecutionContext) => Promise<boolean>;
  routeAttention: (step: IRStep, ctx: ExecutionContext) => Promise<void>;
  approve: (step: IRStep, ctx: ExecutionContext) => Promise<boolean>;
  handlers: Partial<Record<IRStep['actor']['type'], StepHandler>>;
}

export async function resolveAutonomy(
  step: IRStep, ctx: ExecutionContext, confidence?: number
): Promise<AutonomyLevel> {
  if (step.autonomy === 'ALLOW' && step.risk.level === 'high') return 'APPROVAL_REQUIRED';
  if (step.autonomy === 'ALLOW' && typeof confidence === 'number' && confidence < 0.8) return 'SUPERVISED';
  void ctx;
  return step.autonomy;
}

export async function runStep(step: IRStep, ctx: ExecutionContext, deps: RuntimeDeps): Promise<void> {
  await deps.emit({ type: 'step_started', stepId: step.id, payload: {} });
  if (!(await deps.requestAuthorization(step, ctx))) {
    await deps.emit({ type: 'authorization_denied', stepId: step.id, payload: {} });
    return deps.routeAttention(step, ctx);
  }
  const handler = deps.handlers[step.actor.type];
  if (!handler) throw new Error(`no handler for actor type ${step.actor.type}`);
  const result = await handler.execute(step, ctx);
  const effective = await resolveAutonomy(step, ctx, result.confidence);
  if (effective === 'BLOCK') {
    await deps.emit({ type: 'step_blocked', stepId: step.id, payload: { reason: 'policy' } });
    return;
  }
  if (effective === 'APPROVAL_REQUIRED' || step.type === 'approval') {
    await deps.emit({ type: 'approval_requested', stepId: step.id, payload: {} });
    if (!(await deps.approve(step, ctx))) {
      await deps.emit({ type: 'approval_rejected', stepId: step.id, payload: {} });
      return deps.routeAttention(step, ctx);
    }
  }
  await deps.emit({ type: 'step_completed', stepId: step.id, payload: { output: result.output, evidence: result.evidence } });
}
