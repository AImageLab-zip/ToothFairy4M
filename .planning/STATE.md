# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-26)

**Core value:** Clinicians can quickly visualize and compare multiple MRI modalities side-by-side with synchronized navigation, enabling efficient diagnostic workflows.
**Current focus:** Phase 4 - Viewer Display (In Progress)

## Current Position

Phase: 4 of 5 (Viewer Display) — IN PROGRESS
Plan: 1 of 3 in current phase
Status: Plan 04-01 complete
Last activity: 2026-01-28 — Completed 04-01-PLAN.md (NiiVue Setup)

Progress: [███████████░] 67% (10/15 plans total, 1/3 in Phase 4)

## Performance Metrics

**Velocity:**
- Total plans completed: 10
- Average duration: 11 minutes
- Total execution time: 2h 1m

**By Phase:**

| Phase | Plans | Status | Total | Avg/Plan |
|-------|-------|--------|-------|----------|
| 01 | 4 | Complete | 51m | 13m |
| 02 | 2 | Complete | 20m | 10m |
| 03 | 3 | Complete | 51m | 17m |
| 04 | 1/3 | In Progress | 1m | 1m |

**Recent Trend:**
- 03-03: Complete - 45m (VolumeViewer refactor + bug fixes)
- 04-01: Complete - 1m (NiiVue CDN + wrapper class)
- Trend: Simple setup tasks fast, ready for integration work

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

**From 03-03:**
- Refactor CBCTViewer singleton to VolumeViewer class — Enables true multi-window viewing
- Rename CBCT to Volume — Reflects actual functionality (handles all volume types)
- Maintain backward compatibility via wrapper — Zero changes to existing Maxillo templates

**From 04-01:**
- NiiVue v0.66.0 via jsdelivr CDN — Latest stable, exposes window.niivue global
- ES6 class wrapper pattern — Clean API surface for viewer_grid.js integration
- Single-view mode (multiplanar: false) — One view per grid window

### Pending Todos

1. **Refactor VolumeViewer for modularity and async loading** (frontend)
   - Split large monolithic file into focused modules
   - Use Web Workers for background volume loading
   - Preload volumes on page load

### Blockers/Concerns

None - NiiVue setup complete, ready for viewer grid integration.

## Session Continuity

Last session: 2026-01-28 — Completed 04-01-PLAN.md
Stopped at: Plan 04-01 complete (NiiVue Setup)
Resume file: .planning/phases/04-viewer-display/04-02-PLAN.md
Next action: Execute 04-02 (Viewer Grid Integration)
