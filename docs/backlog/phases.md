# G-HAL Implementation Backlog — Phases → Tasks

Every task is accepted only with Done criteria: code + test + API + data model + validation + delegation + audit + error handling + documentation.

## Phase -1 — Outcome & Commercial Validation (Pre-Foundation)
| Task | Description | Acceptance |
|------|-------------|------------|
| T-1.1 | Buyer identification + Problem statement | Signed stakeholder doc |
| T-1.2 | Process owner + Outcome owner assignment | ProcessOutcomeOwner entity with SLA + approval rights |
| T-1.3 | Value quantification + "And then what?" test | Business outcome linked to KPI |
| T-1.4 | Data access agreement + Pilot authorization | Signed authorization + data access |
| T-1.5 | Commercial validation gate (G-1) | All 4 above approved before any code |

## Phase 0 — Foundation
| Task | Description | Acceptance |
|------|-------------|------------|
| T0.1 | Monorepo + TS strict + lint | `pnpm build/test` green |
| T0.2 | Supabase + 0001 + 0002 | Two-tenant isolation |
| T0.3 | Auth + RBAC | Every request carries tenant+role |
| T0.4 | AuditWriter + Hash chaining | Modifying old record breaks verification |
| T0.5 | CI/CD | PR without governance tests = rejected |

## Phase 0.5 — Data Readiness
| Task | Description | Acceptance |
|------|-------------|------------|
| T0.6 | Event schema definition | What opens/closes a case, what is Case ID |
| T0.7 | Case ID mapping + Event mapping | Raw data → structured events |
| T0.8 | Timestamp validation + Event completeness | No missing events without handling rule |
| T0.9 | Data quality gate | Baseline established, quality score ≥ threshold |
| T0.10 | Data readiness gate (G0.5) | All data quality checks pass |

## Phase 1 — Process Core + A.G.E.N.T Framework
| Task | Description | Acceptance |
|------|-------------|------------|
| T1.1 | CRUD Process/Version/Module/Step | IR is the single source of truth |
| T1.2 | validateIR + tests | Invalid IR = 422 |
| T1.3 | P1–P10 state machines | Illegal transition = error |
| T1.4 | Runtime engine | P2 before execution; P4 after |
| T1.5 | Approval workflow | Rejection = Attention route |
| T1.6 | Runtime compiler | Resume from last Event |
| T1.7 | Seed Invoice + Case | Full start→end |
| T1.8 | A.G.E.N.T. Operating Framework artifact | Unified methodology: Audit→Gauge→Engineer→Navigate→Track |
| T1.9 | Process Harness module (explicit) | Context + Agent invocation + Policy + Approval + Evidence + Exception + Drift in one component |
| T1.10 | Outcome-First Design Task | Final outcome statement, Success Criteria, Business Outcome Owner, Metric→Outcome link |

## Phase 2 — Intelligence (S4–S6)
T2.1 Genome builder · T2.2 Query interface · T2.3 Friction Taxonomy · T2.4 Bottleneck · T2.5 RCA · T2.6 Anomaly · T2.7 Health/Debt · T2.8 Discovery Agent

## Phase 3 — Redesign + Dynamic Work Design (S7–S9)
T3.1 ZBPR pipeline · T3.2 Redesign Agent · T3.3 Change Proposals · T3.4 Allocation · T3.5 Autonomy Boundary · T3.6 Attention Router · T3.7 Negotiation · T3.8 Redesign Package
| Task | Description | Acceptance |
|------|-------------|------------|
| T3.9 | Dynamic work redistribution | WIP reduction, flow balancing, variable volume handling |
| T3.10 | Human/Agent resource balancing | Real-time capacity matching |

## Phase 4 — Simulation (S10–S11)
T4.1 Scenario runner · T4.2 What-if · T4.3 Comparison · T4.4 Stress

## Phase 5 — Governance (S12–S13)
T5.1 Policy Engine · T5.2 Provenance · T5.3 Trust Score · T5.4 Webhook sigs · T5.5 Regulatory Adapter · T5.6 Red Team
| Task | Description | Acceptance |
|------|-------------|------------|
| T5.7 | LLM Output Explainability | Evidence vs Source vs Model Output vs Confidence vs Reasoning vs Human Decision vs Final Outcome |
| T5.8 | KPI Dictionary | Name, Formula, Source, Baseline, Target, Owner, Confidence, Limitations per KPI |

## Phase 6 — Exception & Evolution (S14–S15)
T6.1 Exception pipeline · T6.2 Redesign Triggers · T6.3 Evolution Protocol · T6.4 Impact measurement

## Phase 7 — Memory + Human Adoption + Polish (S16–S17)
T7.1 Memory Layer · T7.2 Implementation Spec · T7.3 A.G.E.N.T wizard · T7.4 Golden Dataset · T7.5 Runbooks
| Task | Description | Acceptance |
|------|-------------|------------|
| T7.6 | Organizational memory governance | What stores, version relation, old memory isolation, sensitive data deletion, memory audit |
| T7.7 | Human adoption metrics | Adoption rate, resistance detection, training completion |
| T7.8 | Transition management | Old→new process migration plan, objection mechanism, Human-Agent Collaboration review |
| T7.9 | Agentic-Native Design rules | Design processes from ground up assuming agent capabilities (read, coordinate, verify, escalate) |
