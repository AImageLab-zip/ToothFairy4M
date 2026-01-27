# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-26)

**Core value:** Clinicians can quickly visualize and compare multiple MRI modalities side-by-side with synchronized navigation, enabling efficient diagnostic workflows.
**Current focus:** Phase 1 - Permission Refactoring

## Current Position

Phase: 1 of 5 (Permission Refactoring)
Plan: 3 of TBD in current phase
Status: In progress
Last activity: 2026-01-27 — Completed 01-03-PLAN.md

Progress: [███░░░░░░░] 30%

## Performance Metrics

**Velocity:**
- Total plans completed: 3
- Average duration: 12 minutes
- Total execution time: 0.6 hours

**By Phase:**

| Phase | Plans | Status | Total | Avg/Plan |
|-------|-------|--------|-------|----------|
| 01 | 3 | In Progress | 36m | 12m |

**Recent Trend:**
- 01-01: Complete - 25m (including app rename fix)
- 01-02: Complete - 4m (middleware and permission utilities)
- 01-03: Complete - 7m (view and template refactoring)
- Trend: Excellent velocity, clean execution, improving speed

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

**From 01-02:**
- Use ProjectAccess as request.user.profile — Maintains backward compatibility with existing view/template code
- Create separate PermissionChecker utility — Clean separation between request-based and non-request permission checking

**From 01-03:**
- Simplify auth view to create only ProjectAccess on registration — Unified user onboarding, no app-specific profiles
- Pass target_profile explicitly to templates — Middleware only sets request.user.profile for logged-in user

### Pending Todos

None yet.

### Blockers/Concerns

None - migration issues from 01-01 were resolved.

## Session Continuity

Last session: 2026-01-27 — Executed 01-03-PLAN.md
Stopped at: Completed 01-03-PLAN.md successfully
Resume file: .planning/phases/01-permission-refactoring/01-03-SUMMARY.md
Next action: Continue to next plan in phase (admin cleanup and final UserProfile removal)
