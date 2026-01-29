# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-26)

**Core value:** Clinicians can quickly visualize and compare multiple MRI modalities side-by-side with synchronized navigation, enabling efficient diagnostic workflows.
**Current focus:** Phase 5 in progress — Viewer synchronization

## Current Position

Phase: 5 of 5 (Viewer Synchronization) — COMPLETE
Plan: 2 of 2 in current phase — COMPLETE
Status: All phases complete. Milestone finished.
Last activity: 2026-01-29 — Phase 5 verified and closed

Progress: [████████████████████] 100% (5/5 phases, 14/14 plans complete)

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
| 05 | 2 | Complete | ~60m | ~30m |

**Recent Trend:**
- 04-03: Complete - 5m (Volume caching + error handling)
- 05-01: Complete - 4m (Event-driven synchronization + free-scroll toggle)
- 05-02: Complete - ~55m (Human verification with iterative improvements)
- Trend: Verification checkpoint drove significant user-feedback improvements

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

**From 05-02 (user verification):**
- Full 3D crosshairPos sync across ALL windows — Not orientation-limited, standard medical imaging behavior
- New modality adopts crosshair from existing synced windows on load — Maintains navigation context
- Slice counter (n/total) in bottom-left of each window — Monospace font for readability
- Ctrl+scroll zoom (1x to 5x) with capture-phase event interception — Overrides NiiVue's default scroll
- Ctrl+drag pan with proportional clamping — No pan at 1x, max pan scales with zoom level
- Shift+scroll fast navigation — 5 slices per step
- Reset view button (compress-arrows icon) — Resets zoom and pan to defaults
- `nv.scene.pan2Dxyzmm` is the correct NiiVue 0.67.0 property for pan/zoom state

### Pending Todos

1. **Refactor VolumeViewer for modularity and async loading** (frontend)
   - Split large monolithic file into focused modules
   - Use Web Workers for background volume loading
   - Preload volumes on page load

### Blockers/Concerns

None — All 5 phases complete. Milestone finished.

## Session Continuity

Last session: 2026-01-29 — Phase 5 complete, milestone finished
Stopped at: All phases complete, milestone docs updated
Resume file: None
Next action: Milestone audit (optional) or start next milestone
