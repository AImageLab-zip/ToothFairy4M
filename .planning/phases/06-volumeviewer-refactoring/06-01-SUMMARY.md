---
phase: "06"
plan: "01"
subsystem: "frontend-viewer"
tags: [refactoring, modular-architecture, volume-viewer, three-js, javascript]
dependency-graph:
  requires: ["03-03", "04-03"]
  provides: ["modular-volume-viewer", "separated-concerns"]
  affects: ["06-02", "06-03"]
tech-stack:
  added: []
  patterns: ["IIFE-module-pattern", "constructor-prototype", "delegation-orchestrator"]
key-files:
  created:
    - static/js/modality_viewers/windowing.js
    - static/js/modality_viewers/volume_loader.js
    - static/js/modality_viewers/slice_renderer.js
    - static/js/modality_viewers/volume_interaction.js
  modified:
    - static/js/modality_viewers/volume_viewer.js
decisions:
  - "IIFE + window globals instead of ES6 modules (Django script-tag constraint)"
  - "Constructor-prototype pattern for new modules (consistent with project style)"
  - "Delegation orchestrator pattern for VolumeViewer (thin coordinator)"
  - "Backward-compatible CBCTViewer legacy wrapper preserved with full proxy API"
metrics:
  duration: "5m 30s"
  completed: "2026-02-02"
---

# Phase 6 Plan 01: Split Monolithic VolumeViewer Summary

**One-liner:** Refactored 1387-line monolithic VolumeViewer into 5 focused modules using IIFE+globals pattern with delegation orchestrator

## What Was Done

### Task 1: Analyze current VolumeViewer structure

Analyzed the existing `volume_viewer.js` (1387 lines) and identified 7 responsibility areas:

| Area | Methods | Lines |
|------|---------|-------|
| Volume Loading | `loadVolumeData()` | ~75 |
| NIfTI Parsing | `parseNiftiData()` | ~150 |
| Slice Rendering | `initSliceViewer()`, `updateSlice()`, `createSliceTexture()`, crosshairs | ~400 |
| Interaction | `handleSliceScroll/Zoom/Pan()` | ~100 |
| Windowing | `_calculateWindowParams()`, `applyWindowing()` | ~25 |
| Panoramic | load, interact, canvas, windowing | ~200 |
| Orchestration | constructor, `init()`, `dispose()`, `clearCache()`, resize, errors | ~300 |

Also analyzed `cbct.js` (the production singleton used by Maxillo templates) to ensure no breaking changes -- confirmed that `volume_viewer.js` is the Phase 3 class-based refactor, not loaded by the Maxillo production path.

### Task 2: Design modular architecture

Designed a 5-file module structure with clear separation of concerns:

1. **windowing.js** (VolumeWindowing) - Pure calculation, no DOM/Three.js dependency
2. **volume_loader.js** (VolumeLoader) - Network I/O + NIfTI parsing, no rendering
3. **slice_renderer.js** (SliceRenderer) - Three.js setup, textures, crosshairs, labels
4. **volume_interaction.js** (VolumeInteraction) - All mouse/wheel event handlers
5. **volume_viewer.js** (VolumeViewer) - Thin orchestrator with sub-module delegation

All modules use IIFE wrapping with `window.*` global exports. No ES6 import/export.
Script loading order: windowing -> volume_loader -> slice_renderer -> volume_interaction -> volume_viewer.

### Task 3: Implement module structure

Created 4 new files and refactored volume_viewer.js:

**windowing.js (129 lines)**
- `VolumeWindowing` constructor/prototype
- `calculateParams()`, `applyToValue()`, `applyToPanoramicData()`
- Internal cache with `invalidateCache()`

**volume_loader.js (231 lines)**
- `VolumeLoader` constructor/prototype
- `load(modalitySlug, onSuccess, onError)` callback API
- `_buildUrl()`, `_decompress()`, `_parseNifti()`
- Handles all NIfTI datatypes (uint8, int8, uint16, int16, uint32, int32, float32, float64)

**slice_renderer.js (487 lines)**
- `SliceRenderer` constructor taking viewer reference
- `initializeViewers()`, `initSliceViewer()`, `initVolumeViewerPlaceholder()`
- `updateSlice()`, `createSliceTexture()`, `addCrosshairs()`
- `updateSliceLabel()`, `handleResize()`, `refreshAllViews()`
- Helper `_addLine()` for crosshair DRY refactor

**volume_interaction.js (439 lines)**
- `VolumeInteraction` constructor taking viewer reference
- `bindSliceEvents()` - attaches wheel/mouse handlers to canvas
- `handleSliceScroll/Zoom/Pan()` - slice navigation
- Panoramic: `loadPanoramicImage()`, `initPanoramicInteraction()`, zoom/pan/reset
- `updatePanoramicWindowing()`, `forceRefreshPanoramic()`

**volume_viewer.js (472 lines, down from 1387)**
- ES6 class with 4 sub-module instances created in constructor
- `init()`, `dispose()`, `clearCache()`, `refreshAllViews()`, `resetAllViews()`
- Backward-compatible property accessors (`windowPercentMin/Max`)
- Legacy `CBCTViewer` wrapper with full proxy API including `panoramicLoaded` and `loadPanoramicImage()`

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| IIFE + window globals | Django project has no bundler; all JS loaded via script tags |
| Constructor-prototype in modules | Consistent with existing codebase patterns (cbct.js, ios.js) |
| Delegation over inheritance | VolumeViewer orchestrates rather than extending; cleaner separation |
| Crosshair `_addLine()` helper | DRY refactor of repetitive crosshair line creation code |
| Callback API for VolumeLoader | Simpler than Promises for script-tag environment; matches project patterns |
| Full legacy wrapper proxy | Ensures backward compatibility if volume_viewer.js is loaded alongside cbct.js |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added panoramicLoaded and loadPanoramicImage to legacy wrapper**

- **Found during:** Task 3 verification
- **Issue:** `patient_detail.js` uses `CBCTViewer.panoramicLoaded` and `CBCTViewer.loadPanoramicImage()` which were missing from the legacy wrapper
- **Fix:** Added getter/setter for `panoramicLoaded` and `loadPanoramicImage()` method to the `window.CBCTViewer` proxy
- **Files modified:** `static/js/modality_viewers/volume_viewer.js`
- **Commit:** f1d2b76

## Verification

- [x] All 5 files pass `node -c` syntax validation
- [x] VolumeViewer class preserves all public methods: `init()`, `dispose()`, `clearCache()`, `refreshAllViews()`, `resetAllViews()`, `handleResize()`, `forceRefreshPanoramic()`, `showError()`
- [x] Legacy `CBCTViewer` wrapper preserved with full proxy: `init`, `dispose`, `clearCache`, `refreshAllViews`, `loadPanoramicImage`, `forceRefreshPanoramic`, `initialized`, `loading`, `volumeData`, `dimensions`, `panoramicLoaded`
- [x] Backward-compatible `windowPercentMin`/`windowPercentMax` property accessors maintained
- [x] No ES6 import/export used -- all modules use `window.*` globals
- [x] Each module has single, focused responsibility
- [x] `cbct.js` (Maxillo production path) completely untouched

## Next Phase Readiness

Plan 06-02 and 06-03 can proceed. The modular structure enables:
- 06-02: Web Worker background loading (VolumeLoader is now isolated)
- 06-03: Preloading volumes on page load (VolumeLoader can be invoked independently)
