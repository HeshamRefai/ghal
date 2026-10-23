# G-HAL — Adaptive Process Redesign System

> Infrastructure for understanding, redesigning, governing, executing, measuring, and continuously evolving organizational work in the Agentic AI era.

**Status:** Phase 0/1 — Foundation + Process Core + **campaign-launch vertical slice** (import → baseline → diagnose → propose → approve → versioned execution tracking → measured outcome comparison → rollback). See [docs/audit-2026-10-23.md](docs/audit-2026-10-23.md).

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
  api/        REST API (Hono) + Seed + vertical slice (/vs)
modules/      7 Engines + Model Gateway + Audit + Protocols + Governance
              + ingestion, metrics, diagnostics, redesign, outcomes (vertical slice)
domain/       Unified domain model
infrastructure/
  database/   migrations 0001_core + 0002_security (Supabase/Postgres)
tests/        Golden Dataset + mandatory governance tests + vertical-slice integration
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
pnpm test           # 73 tests: unit + integration + governance + vertical slice
pnpm typecheck      # tsc project-wide

# Vertical slice without Supabase (JSON-file dev store):
cd apps/api && pnpm dev   # API on :8787, vertical slice under /vs
```

Vertical-slice quick demo (dev mode):

```bash
T=11111111-1111-1111-1111-111111111111          # pilot tenant
U=aaaaaaaa-0000-0000-0000-000000000002          # manager
H="content-type: application/json"
PID=$(curl -s -X POST localhost:8787/vs/processes -H "$H" -H "x-tenant-id: $T" -H "x-user-id: $U" \
  -d '{"name":"Campaign launch"}' | jq -r .id)
curl -s -X POST localhost:8787/vs/processes/$PID/import -H "$H" -H "x-tenant-id: $T" -H "x-user-id: $U" \
  -d "{\"csv\": $(jq -Rs . < tests/fixtures/campaign-launch.csv)}" | jq .capabilities
curl -s -X POST localhost:8787/vs/processes/$PID/baseline    -H "$H" -H "x-tenant-id: $T" -H "x-user-id: $U" | jq '.metrics[].name'
curl -s -X POST localhost:8787/vs/processes/$PID/diagnostics -H "$H" -H "x-tenant-id: $T" -H "x-user-id: $U" | jq '.[].type'
curl -s -X POST localhost:8787/vs/processes/$PID/proposals   -H "$H" -H "x-tenant-id: $T" -H "x-user-id: $U" | jq '.[].title'
```

Full Supabase mode (legacy endpoints): create `.env.local` from `.env.example`,
`pnpm db:push`, `pnpm --filter @ghal/api seed`, `pnpm --filter @ghal/api dev:supabase`.
Never commit the service-role key (see docs/audit-2026-10-23.md §2).

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
| Vertical Slice | Full campaign-launch loop over HTTP: import → baseline → diagnose → propose → approve → version → execute → outcomes → rollback; permission + tenant isolation; audit-chain verification |

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
