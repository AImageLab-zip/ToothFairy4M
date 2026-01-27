# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-26)

**Core value:** Clinicians can quickly visualize and compare multiple MRI modalities side-by-side with synchronized navigation, enabling efficient diagnostic workflows.
**Current focus:** Phase 1 - Permission Refactoring

## Current Position

Phase: 1 of 5 (Permission Refactoring)
Plan: 1 of TBD in current phase
Status: BLOCKED - Migration issues
Last activity: 2026-01-27 — Completed 01-01-PLAN.md (2/3 tasks, blocked by migration inconsistencies)

Progress: [█░░░░░░░░░] 10%

## Performance Metrics

**Velocity:**
- Total plans completed: 0 (1 blocked)
- Average duration: N/A
- Total execution time: 0.2 hours

**By Phase:**

| Phase | Plans | Status | Total | Avg/Plan |
|-------|-------|--------|-------|----------|
| 01 | 1 | Blocked (2/3 tasks) | 12m | 12m |

**Recent Trend:**
- 01-01: BLOCKED - Migration graph inconsistencies
- Trend: Need architectural decision to proceed

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Refactor before new features — Clean permission model prevents bugs in new code
- 2x2 grid (not larger) — Matches 4 modalities, keeps UI manageable
- Cache volumes on first load — Enables fast drag-drop without re-loading
- Synchronized scrolling as default — Clinical workflow expects registered views

**From 01-01:**
- Keep can_view and can_upload fields during transition — Backward compatibility, remove in later plan
- Depend on maxillo.0005 migrations directly — Simplified migration dependencies

### Pending Todos

None yet.

### Blockers/Concerns

**CRITICAL BLOCKER (01-01):**
- Django migration graph inconsistency due to app rename (scans → maxillo)
- Duplicate migration numbers: two 0004s and two 0005s in maxillo/migrations/
- Django cannot build migration graph: `NodeNotFoundError` on maxillo.0002
- Impacts: Cannot run migrations, cannot apply 0015/0016, cannot proceed with Phase 01
- Options: (A) Squash maxillo migrations, (B) Manual database fix, (C) Fresh database
- **NEEDS ARCHITECTURAL DECISION**

## Session Continuity

Last session: 2026-01-27 — Executed 01-01-PLAN.md
Stopped at: Blocked by migration graph issue, awaiting architectural decision
Resume file: .planning/phases/01-permission-refactoring/01-01-SUMMARY.md
Next action: User must choose migration fix approach (A/B/C) before continuing
