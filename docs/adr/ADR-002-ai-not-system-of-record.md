# ADR-002: AI is NOT System of Record + Agent Governance

**Status:** Accepted — from Phase 0, never changes

## Decision
Every LLM output is a **proposal** that goes through: Intent → Policy Check (P2) → Authorization → Risk Check → Execution → Evidence → Audit (P10) → Outcome.

- The single source of truth: PostgreSQL.
- The LLM holds no state between requests.
- Model Gateway is the only entry point for models.

## Mandatory CI Test
Scenario: an agent requests a tool outside `allowed_tools` → P2 must reject it and P10 must log it. Any build that fails this test is rejected.
