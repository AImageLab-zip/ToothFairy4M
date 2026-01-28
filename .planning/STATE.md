# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-26)

**Core value:** Clinicians can quickly visualize and compare multiple MRI modalities side-by-side with synchronized navigation, enabling efficient diagnostic workflows.
**Current focus:** Phase 1 Complete - Ready for Phase 2

## Current Position

Phase: 2 of 5 (Brain Upload) — IN PROGRESS
Plan: 1 of 3 in current phase
Status: In progress
Last activity: 2026-01-28 — Completed 02-01-PLAN.md

Progress: [██████████░░░░░░░░░░░░░░░░░░░] 33% (Phase 2: 1/3 plans)

## Performance Metrics

**Velocity:**
- Total plans completed: 5
- Average duration: 11 minutes
- Total execution time: 0.9 hours

**By Phase:**

| Phase | Plans | Status | Total | Avg/Plan |
|-------|-------|--------|-------|----------|
| 01 | 4 | Complete | 51m | 13m |
| 02 | 1 | In Progress | 2m | 2m |

**Recent Trend:**
- 01-01: Complete - 25m (including app rename fix)
- 01-02: Complete - 4m (middleware and permission utilities)
- 01-03: Complete - 7m (view and template refactoring)
- 01-04: Complete - 15m (model removal and migrations)
- 02-01: Complete - 2m (brain modality infrastructure)
- Trend: Excellent velocity, infrastructure setup very fast

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

**From 01-04:**
- Use Django makemigrations for model deletion — Auto-generated migrations are reliable
- Remove profile creation signals entirely — Users get access via invitation only

**From 02-01:**
- Brain modalities use immediate completion pattern — No async processing needed for pre-processed .nii.gz volumes
- Brain project follows Maxillo modality registration pattern — Reuse existing infrastructure

### Pending Todos

None.

### Blockers/Concerns

None - Phase 1 complete with clean permission architecture.

## Session Continuity

Last session: 2026-01-28 — Executed 02-01-PLAN.md
Stopped at: Completed 02-01-PLAN.md (Brain Upload Infrastructure)
Resume file: .planning/phases/02-brain-upload/02-01-SUMMARY.md
Next action: Proceed to 02-02 (Brain Upload Views)
