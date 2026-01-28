# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-26)

**Core value:** Clinicians can quickly visualize and compare multiple MRI modalities side-by-side with synchronized navigation, enabling efficient diagnostic workflows.
**Current focus:** Phase 3 - Viewer Grid (Planning Complete)

## Current Position

Phase: 3 of 5 (Viewer Grid) — IN PROGRESS
Plan: 2 of 3 in current phase
Status: Executing Phase 3
Last activity: 2026-01-28 — Completed 03-02-PLAN.md

Progress: [████████░░] 48% (2.4/5 phases)

## Performance Metrics

**Velocity:**
- Total plans completed: 8
- Average duration: 9 minutes
- Total execution time: 1.3 hours

**By Phase:**

| Phase | Plans | Status | Total | Avg/Plan |
|-------|-------|--------|-------|----------|
| 01 | 4 | Complete | 51m | 13m |
| 02 | 2 | Complete | 20m | 10m |
| 03 | 2 | In Progress | 6m | 3m |

**Recent Trend:**
- 02-01: Complete - 2m (brain modality infrastructure)
- 02-02: Complete - 18m (verification + bug fixes)
- 03-01: Complete - 3m (2x2 grid layout foundation)
- 03-02: Complete - 3m (drag-drop interaction)
- Trend: Exceptional velocity on UI work, clean JavaScript patterns

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Refactor before new features — Clean permission model prevents bugs in new code
- 2x2 grid (not larger) — Matches 4 modalities, keeps UI manageable
- Cache volumes on first load — Enables fast drag-drop without re-loading
- Synchronized scrolling as default — Clinical workflow expects registered views

**From 01-04:**
- Use Django makemigrations for model deletion — Auto-generated migrations are reliable
- Remove profile creation signals entirely — Users get access via invitation only

**From 02-01:**
- Brain modalities use immediate completion pattern — No async processing needed for pre-processed .nii.gz volumes
- Brain project follows Maxillo modality registration pattern — Reuse existing infrastructure

**From 02-02:**
- Patient project assignment uses current session project — Fixed hardcoded Maxillo assignment
- Docker volume mount: /dataset-dev:/dataset — Dev environment isolation

**From 03-01:**
- CSS Grid instead of Bootstrap grid — Better control over equal-height windows
- Draggable chips instead of dropdown — More intuitive for multi-window workflow
- Fixed 600px grid height — Consistent window sizing, prevents layout jumps
- Black background for empty windows — Medical imaging convention (prevents white flash)

**From 03-02:**
- JSON data script over inline attributes — Cleaner Django→JS data flow, avoids template filter complexity
- Window state object pattern — Single source of truth for UI state, enables future persistence
- Module pattern with public API — Encapsulated state (windowStates, loadModalityInWindow, clearWindow)

### Pending Todos

None.

### Blockers/Concerns

None - Phase 2 complete with working brain upload flow.

## Session Continuity

Last session: 2026-01-28 — Executing Phase 3
Stopped at: Completed 03-02-PLAN.md
Resume file: .planning/phases/03-viewer-grid/03-03-PLAN.md
Next action: Execute plan 03-03 (NIfTI viewer integration)
