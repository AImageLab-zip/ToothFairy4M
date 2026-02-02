# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-26)

**Core value:** Clinicians can quickly visualize and compare multiple MRI modalities side-by-side with synchronized navigation, enabling efficient diagnostic workflows.
**Current focus:** Milestone Complete — All 6 phases done

## Current Position

Phase: 6 of 6 (VolumeViewer Refactoring) — COMPLETE
Plan: 3 of 3 in current phase
Status: All phases complete
Last activity: 2026-02-02 — Completed 06-02 and 06-03 (Worker + preloading)

Progress: [████████████████████] 100% (6/6 phases complete)

## Performance Metrics

**Velocity:**
- Total plans completed: 17
- Average duration: ~10 minutes
- Total execution time: ~2h 30m

**By Phase:**

| Phase | Plans | Status | Total | Avg/Plan |
|-------|-------|--------|-------|----------|
| 01 | 4 | Complete | 51m | 13m |
| 02 | 2 | Complete | 20m | 10m |
| 03 | 3 | Complete | 51m | 17m |
| 04 | 3 | Complete | 8m | 2.7m |
| 05 | 2 | Complete | ~60m | ~30m |
| 06 | 3 | Complete | ~11m | ~3.7m |

**Recent Trend:**
- 06-01: Complete - 5.5m (Modular split of VolumeViewer)
- 06-02: Complete - ~3m (Web Worker for background NIfTI parsing)
- 06-03: Complete - ~3m (Preload cache + DOMContentLoaded trigger)
- Trend: Refactoring plans execute faster than feature plans

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

**From 06-01:**
- IIFE + window globals for module pattern — Django script-tag constraint, no bundler
- Constructor-prototype pattern in modules — Consistent with project patterns
- Delegation orchestrator for VolumeViewer — Thin coordinator delegates to focused modules
- Crosshair `_addLine()` helper — DRY refactor of repetitive crosshair line creation

**From 06-02:**
- Web Worker with `self.window = self` shim for nifti-reader.js — Workers have no window global
- Transferable ArrayBuffer for zero-copy data return — Avoids cloning large Float32Arrays
- Automatic fallback to main-thread parsing — Graceful degradation if Worker unavailable

**From 06-03:**
- Preload cache keyed by `scanId:modalitySlug` — Shared between VolumeLoader.preload() and cbct.js
- Promise-based subscription for in-flight cache entries — No duplicate requests
- DOMContentLoaded preload only if CBCT available and processed — Avoids unnecessary fetches

### Pending Todos

None — All milestone phases complete.

### Blockers/Concerns

None — Milestone complete.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 001 | Fix viewer pan limits, zoom toward cursor, right-click context menu | 2026-01-29 | ef900a4 | [001-fix-viewer-pan-limits-zoom-context-menu](./quick/001-fix-viewer-pan-limits-zoom-context-menu/) |
| 002 | Add Alt+left click intensity adjustment (window/level) | 2026-01-29 | a9b9212 | [002-add-alt-click-intensity-square](./quick/002-add-alt-click-intensity-square/) |
| 003 | Fix Alt+right-click intensity, add crosshair toggle | 2026-01-29 | f3cbd57 | [003-fix-alt-click-add-crosshair-toggle](./quick/003-fix-alt-click-add-crosshair-toggle/) |

## Session Continuity

Last session: 2026-02-02 — Completed all Phase 6 plans (modular split, Worker, preloading)
Stopped at: Milestone complete
Resume file: None
Next action: /gsd:complete-milestone or /gsd:new-milestone
