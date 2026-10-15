/**
 * Protocols P1–P10
 * كل بروتوكول آلة حالات تُسجَّل انتقالاتها في AuditEvent.
 */
export interface ProtocolStateMachine<S extends string, E extends string> {
  id: string; initial: S; states: readonly S[];
  transitions: Array<{ from: S; to: S; on: E }>;
}

export type AuthzState = 'REQUESTED' | 'CHECKED' | 'GRANTED' | 'DENIED' | 'LOGGED';
export const P2_AUTHORIZATION: ProtocolStateMachine<AuthzState, 'CHECK' | 'GRANT' | 'DENY' | 'LOG'> = {
  id: 'P2', initial: 'REQUESTED',
  states: ['REQUESTED','CHECKED','GRANTED','DENIED','LOGGED'],
  transitions: [
    { from: 'REQUESTED', to: 'CHECKED', on: 'CHECK' },
    { from: 'CHECKED', to: 'GRANTED', on: 'GRANT' },
    { from: 'CHECKED', to: 'DENIED', on: 'DENY' },
    { from: 'GRANTED', to: 'LOGGED', on: 'LOG' },
    { from: 'DENIED', to: 'LOGGED', on: 'LOG' },
  ],
};

export type VerifyState = 'EXECUTED' | 'VERIFIED' | 'FAILED' | 'COMPENSATED';
export const P4_VERIFICATION: ProtocolStateMachine<VerifyState, 'VERIFY' | 'FAIL' | 'COMPENSATE'> = {
  id: 'P4', initial: 'EXECUTED',
  states: ['EXECUTED','VERIFIED','FAILED','COMPENSATED'],
  transitions: [
    { from: 'EXECUTED', to: 'VERIFIED', on: 'VERIFY' },
    { from: 'EXECUTED', to: 'FAILED', on: 'FAIL' },
    { from: 'FAILED', to: 'COMPENSATED', on: 'COMPENSATE' },
  ],
};

export type EvolutionState = 'DETECTED' | 'PROPOSED' | 'IMPACT_ANALYZED' | 'SIMULATED' | 'APPROVED' | 'ROLLED_OUT' | 'MEASURED' | 'REJECTED';
export const P5_EVOLUTION: ProtocolStateMachine<EvolutionState, 'PROPOSE' | 'ANALYZE' | 'SIMULATE' | 'APPROVE' | 'REJECT' | 'ROLLOUT' | 'MEASURE'> = {
  id: 'P5', initial: 'DETECTED',
  states: ['DETECTED','PROPOSED','IMPACT_ANALYZED','SIMULATED','APPROVED','ROLLED_OUT','MEASURED','REJECTED'],
  transitions: [
    { from: 'DETECTED', to: 'PROPOSED', on: 'PROPOSE' },
    { from: 'PROPOSED', to: 'IMPACT_ANALYZED', on: 'ANALYZE' },
    { from: 'IMPACT_ANALYZED', to: 'SIMULATED', on: 'SIMULATE' },
    { from: 'SIMULATED', to: 'APPROVED', on: 'APPROVE' },
    { from: 'SIMULATED', to: 'REJECTED', on: 'REJECT' },
    { from: 'APPROVED', to: 'ROLLED_OUT', on: 'ROLLOUT' },
    { from: 'ROLLED_OUT', to: 'MEASURED', on: 'MEASURE' },
  ],
};

export type AttentionState = 'ROUTED' | 'VIEWED' | 'DECIDED' | 'TIMEOUT' | 'ESCALATED';
export const P7_ATTENTION: ProtocolStateMachine<AttentionState, 'VIEW' | 'DECIDE' | 'TIMEOUT' | 'ESCALATE'> = {
  id: 'P7', initial: 'ROUTED',
  states: ['ROUTED','VIEWED','DECIDED','TIMEOUT','ESCALATED'],
  transitions: [
    { from: 'ROUTED', to: 'VIEWED', on: 'VIEW' },
    { from: 'VIEWED', to: 'DECIDED', on: 'DECIDE' },
    { from: 'ROUTED', to: 'TIMEOUT', on: 'TIMEOUT' },
    { from: 'TIMEOUT', to: 'ESCALATED', on: 'ESCALATE' },
  ],
};

export function transition<S extends string, E extends string>(
  sm: ProtocolStateMachine<S, E>, current: S, event: E
): S {
  const t = sm.transitions.find((x) => x.from === current && x.on === event);
  if (!t) throw new Error(`P10-audit-worthy invalid transition: ${sm.id} ${current} -/${event}/->`);
  return t.to;
}
