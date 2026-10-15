# ADR-001: Modular Monolith + Stack

**Status:** Accepted (Phase 0)

## Decision
Single monorepo (pnpm workspaces): Next.js for frontend, REST API in the same system, PostgreSQL via Supabase, Cloudflare hosting, strict TypeScript.

## Rejected Alternatives
- **Microservices:** 7 engines share models and transactions; distribution now = distributed state with no benefit
- **Kubernetes:** No operational need; Cloudflare + Supabase is sufficient for MVP
- **Vector DB:** No semantic search requirement yet in MVP; JSONB is sufficient
- **Python Backend:** Statistical modeling can be done later via worker; most of the system is Workflow/State logic in TS

## Future Impact
Every module is extractable as an independent service when the need is proven.
