# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-26)

**Core value:** Clinicians can quickly visualize and compare multiple MRI modalities side-by-side with synchronized navigation, enabling efficient diagnostic workflows.
**Current focus:** Phase 5 in progress — Viewer synchronization

## Current Position

Phase: 5 of 5 (Viewer Synchronization) — IN PROGRESS
Plan: 1 of 1 in current phase — COMPLETE
Status: Phase 5 Plan 01 complete (synchronized scrolling implemented)
Last activity: 2026-01-29 — Completed 05-01-PLAN.md

Progress: [████████████████████] 100% (5/5 phases, 13/13 plans complete)

## Performance Metrics

**Velocity:**
- Total plans completed: 13
- Average duration: 10 minutes
- Total execution time: 2h 13m

**By Phase:**

| Phase | Plans | Status | Total | Avg/Plan |
|-------|-------|--------|-------|----------|
| 01 | 4 | Complete | 51m | 13m |
| 02 | 2 | Complete | 20m | 10m |
| 03 | 3 | Complete | 51m | 17m |
| 04 | 3 | Complete | 8m | 2.7m |
| 05 | 1 | Complete | 4m | 4m |

**Recent Trend:**
- 04-02: Complete - 2m (NiiVue integration + orientation menu)
- 04-03: Complete - 5m (Volume caching + error handling)
- 05-01: Complete - 4m (Event-driven synchronization + free-scroll toggle)
- Trend: Fast execution on well-planned tasks

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
- JSON data script over inline attributes — Cleaner Django->JS data flow, avoids template filter complexity
- Window state object pattern — Single source of truth for UI state, enables future persistence
- Module pattern with public API — Encapsulated state (windowStates, loadModalityInWindow, clearWindow)

**From 03-03:**
- Refactor CBCTViewer singleton to VolumeViewer class — Enables true multi-window viewing
- Rename CBCT to Volume — Reflects actual functionality (handles all volume types)
- Maintain backward compatibility via wrapper — Zero changes to existing Maxillo templates

**From 04-01:**
- NiiVue v0.67.0 via jsdelivr CDN UMD build — Fixed from 0.66.0 which had export issues
- ES6 class wrapper pattern — Clean API surface for viewer_grid.js integration
- Single-view mode (multiplanar: false) — One view per grid window

**From 04-02:**
- Replace VolumeViewer with NiiVueViewer — Single-view NiiVue matches grid window design
- Fetch blob before NiiVue init — NiiVue needs blob data, not URLs
- Orientation menu as overlay — A/S/C buttons positioned top-right with z-index 20
- stopPropagation on buttons — Prevents clicks from propagating to NiiVue canvas

**From 04-03:**
- Cache persists across window clears — Network optimization trumps memory management
- Error messages mapped to HTTP codes — User-friendly messages for 404, 403, network errors
- Removed volume_viewer.js from brain template — NiiVue handles all volume viewing

**From 05-01:**
- Event-driven synchronization via custom DOM events — Loose coupling between viewer instances
- Group consensus from first ready viewer — Simple and predictable re-sync behavior
- Yellow active state for free-scroll button — High-contrast visual feedback for sync status

### Pending Todos

1. **Refactor VolumeViewer for modularity and async loading** (frontend)
   - Split large monolithic file into focused modules
   - Use Web Workers for background volume loading
   - Preload volumes on page load

### Blockers/Concerns

None — Phase 5 complete. All 5 phases complete. Milestone ready for final verification.

## Session Continuity

Last session: 2026-01-29 — Phase 5 Plan 01 executed
Stopped at: Completed 05-01-PLAN.md (all phases complete)
Resume file: None
Next action: Phase 5 verification testing, then milestone audit
