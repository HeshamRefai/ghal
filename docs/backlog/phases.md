# G-HAL Implementation Backlog — Phases → Tasks

Every task is accepted only with Done criteria: code + test + API + data model + validation + delegation + audit + error handling + documentation.

## Phase 0 — Foundation
| Task | Description | Acceptance |
|------|-------------|------------|
| T0.1 | Monorepo + TS strict + lint | `pnpm build/test` green |
| T0.2 | Supabase + 0001 + 0002 | Two-tenant isolation |
| T0.3 | Auth + RBAC | Every request carries tenant+role |
| T0.4 | AuditWriter + Hash chaining | Modifying old record breaks verification |
| T0.5 | CI/CD | PR without governance tests = rejected |

## Phase 1 — Process Core
| Task | Description | Acceptance |
|------|-------------|------------|
| T1.1 | CRUD Process/Version/Module/Step | IR is the single source of truth |
| T1.2 | validateIR + tests | Invalid IR = 422 |
| T1.3 | P1–P10 state machines | Illegal transition = error |
| T1.4 | Runtime engine | P2 before execution; P4 after |
| T1.5 | Approval workflow | Rejection = Attention route |
| T1.6 | Runtime compiler | Resume from last Event |
| T1.7 | Seed Invoice + Case | Full start→end |

## Phase 2 — Intelligence (S4–S6)
T2.1 Genome builder · T2.2 Query interface · T2.3 Friction Taxonomy · T2.4 Bottleneck · T2.5 RCA · T2.6 Anomaly · T2.7 Health/Debt · T2.8 Discovery Agent

## Phase 3 — Redesign (S7–S9)
T3.1 ZBPR pipeline · T3.2 Redesign Agent · T3.3 Change Proposals · T3.4 Allocation · T3.5 Autonomy Boundary · T3.6 Attention Router · T3.7 Negotiation · T3.8 Redesign Package

## Phase 4 — Simulation (S10–S11)
T4.1 Scenario runner · T4.2 What-if · T4.3 Comparison · T4.4 Stress

## Phase 5 — Governance (S12–S13)
T5.1 Policy Engine · T5.2 Provenance · T5.3 Trust Score · T5.4 Webhook sigs · T5.5 Regulatory Adapter · T5.6 Red Team

## Phase 6 — Exception & Evolution (S14–S15)
T6.1 Exception pipeline · T6.2 Redesign Triggers · T6.3 Evolution Protocol · T6.4 Impact measurement

## Phase 7 — Memory & Polish (S16–S17)
T7.1 Memory Layer · T7.2 Implementation Spec · T7.3 A.G.E.N.T wizard · T7.4 Golden Dataset · T7.5 Runbooks
