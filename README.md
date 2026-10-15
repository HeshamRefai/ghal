# G-HAL — Adaptive Process Redesign System

> Infrastructure for understanding, redesigning, governing, executing, measuring, and continuously evolving organizational work in the Agentic AI era.

**Status:** Phase 0/1 — Foundation + Process Core implemented, live database, Pilot data seeded.

## Live Resources

| Resource | Link |
|----------|------|
| Source Code | https://github.com/HeshamRefai/ghal |
| Database | https://glzrohbiswtokurwuwxx.supabase.co |
| Architecture Deliverable | [G-HAL-Complete-Deliverable.pdf](docs/G-HAL-Complete-Deliverable.pdf) |
| Execution Plan | [G-HAL-Master-Execution-Plan.md](docs/G-HAL-Master-Execution-Plan.md) |
| Gap Analysis | [docs/gap-analysis.md](docs/gap-analysis.md) |

## Non-Negotiable Principles

1. **AI proposes — G-HAL controls.** AI suggests and reasons; the system owns state, policy, delegation, execution, and audit.
2. **Every idea from the source document has an architectural home** — 85/85 covered.
3. **Process is exported, policies are externalized, evidence is traceable, agents are governed.**
4. Modular Monolith — strict module boundaries, extractable to services later without rebuilding.

## Structure

```
apps/
  web/        Next.js — all UIs (RTL Arabic ready)
  api/        REST API (Hono) + Seed
modules/      7 Engines + Model Gateway + Audit + Protocols + Governance
domain/       Unified domain model
infrastructure/
  database/   migrations 0001_core + 0002_security (Supabase/Postgres)
tests/        Golden Dataset + mandatory governance tests
docs/         ADRs + Backlog + Architecture Reports + Gap Analysis
```

## Lifecycle

```
DISCOVER → MODEL → AUDIT → GAUGE → DIAGNOSE → REDESIGN → ALLOCATE → SIMULATE
→ GOVERN → SPECIFY → EXECUTE → OBSERVE → MEASURE → LEARN → EVOLVE → REDESIGN
```

## Getting Started

```bash
pnpm install
# Create .env.local from .env.example (keys are present)
pnpm db:push        # supabase db push
pnpm --filter @ghal/api seed   # Pilot data
pnpm dev            # web + api
pnpm test           # unit + integration + governance
```

## Database (Supabase)

| Table | Purpose |
|-------|---------|
| organizations | Multi-tenant isolation |
| users, roles, user_roles | RBAC |
| actors | Humans + Agents + Systems (trust + reputation) |
| processes, process_versions | Process versioning |
| process_modules, process_steps, process_transitions | Materialized IR |
| cases, events | Event Sourcing |
| policies, parameters | Policy-as-Code + externalized parameters |
| decisions, approvals | Evidenced decisions + approvals |
| exceptions | Exceptions + classification |
| audit_events | Append-only + SHA-256 hash chaining |
| change_proposals | Continuous evolution |
| process_memories | Process memory |

**Security:**
- RLS on 18 tables — every query goes through `current_tenant()`
- Audit Events: Append-only + SHA-256 chain + `audit_chain()` trigger
- `REVOKE UPDATE/DELETE` on audit_events

## Pilot: Invoice Processing

4 modules (Intake → Validation → Approval → Payment), 5 steps, 3 KPIs (Cycle Time, Exception Rate, Auto-Approval).

## Tests (CI = Gate)

| Type | Description |
|------|-------------|
| Governance Tests | Deny by default, Agent tool abuse blocked, Approval thresholds |
| IR Validation | Outcome-First, no ALLOW on approval, no ALLOW on high-risk |
| Protocol Tests | P2, P4, P5, P7 transitions — illegal transitions throw |
| Runtime Tests | Authorization before execution, Autonomy boundary |

## Coverage & Gaps

The execution plan covers ~70–80% of the source vision as executable tasks. A systematic gap analysis identified 5 modules that need explicit addition:

| Module | Phase | Purpose |
|--------|-------|---------|
| Outcome & Commercial Validation | Pre-Phase 0 | Buyer, Owner, Problem, Value, Data Access, Pilot Authorization |
| Data Readiness | Phase 0/1 | Event schema, Case ID mapping, Quality gates, Baseline |
| A.G.E.N.T. Operating Framework | Phase 1 | Unified methodology artifact per letter (Audit→Gauge→Engineer→Navigate→Track) |
| Process Harness | Phase 1/2 | Explicit unified component: context, agent invocation, policy, approval, evidence, exception, drift |
| Human Adoption & Dynamic Work Design | Phase 3/7 | Adoption metrics, training, transition, WIP management, flow balancing |

See [docs/gap-analysis.md](docs/gap-analysis.md) for full audit.

## Remaining (Phases 2–7)

- Phase 2: Intelligence engines (Genome, Friction, Bottleneck, Anomaly)
- Phase 3: ZBPR + Allocation + Autonomy Boundary + Attention Router
- Phase 4: Simulation (Scenario runner, What-if, Stress)
- Phase 5: Governance (Provenance, Trust Score, Regulatory Adapter)
- Phase 6: Exception → Evolution trigger
- Phase 7: Memory + A.G.E.N.T wizard + Golden Dataset

## References

- `docs/architecture/` — Full architecture report
- `docs/execution-plan/` — Complete execution plan
- `docs/adr/` — Architectural decisions (ADR-001, ADR-002)
- `docs/backlog/` — Phase → Task breakdown
- `docs/gap-analysis.md` — Systematic audit of source ideas vs. execution plan
