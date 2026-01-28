---
phase: 03-viewer-grid
plan: 03
subsystem: frontend-viewer
status: complete
completed: 2026-01-28
duration: 45min
tags: [javascript, volume-viewer, refactor, multi-instance, es6-class]

requires:
  - 03-01: Grid layout structure
  - 03-02: Drag-drop interaction and state management

provides:
  - True multi-window volume viewing (no singleton limitation)
  - VolumeViewer ES6 class with per-instance state
  - Independent volume loading per window
  - Backward compatibility for legacy CBCTViewer API

affects:
  - 04-*: Single-view orientation switching builds on this foundation
  - 05-*: Synchronized scrolling can now work across multiple instances

tech-stack:
  added: []
  patterns:
    - ES6 class instead of singleton object
    - Per-instance Three.js scenes/renderers/cameras
    - Instance-based volume data caching

key-files:
  created:
    - static/js/modality_viewers/volume_viewer.js
  modified:
    - static/js/viewer_grid.js
    - templates/brain/patient_detail_content.html

decisions:
  - decision: Refactor CBCTViewer singleton to VolumeViewer class
    rationale: Singleton pattern prevented true multi-window support
    impact: Each window now has independent state, enabling 4 simultaneous viewers

  - decision: Maintain backward compatibility via CBCTViewer wrapper
    rationale: Maxillo pages still use legacy API
    impact: Zero changes needed to existing Maxillo templates

  - decision: Rename from "CBCT" to "Volume"
    rationale: Viewer handles all volume types (brain MRI, CBCT, etc.)
    impact: More accurate naming reflects actual functionality

commits:
  - hash: 25c6784
    message: "fix(03-03): serialize modality loads with queue (CBCTViewer singleton)"
    note: "Intermediate fix before refactor"

  - hash: 4c6c35b
    message: "refactor(03-03): convert CBCTViewer singleton to VolumeViewer class"
---

# Phase 03 Plan 03: NIfTI Viewer Integration Summary

**One-liner:** Refactored CBCTViewer singleton into VolumeViewer ES6 class enabling true multi-window volume viewing with independent state per window.

## What Was Built

### 1. VolumeViewer Class (static/js/modality_viewers/volume_viewer.js)

New ES6 class (~1200 lines) with per-instance state:

```javascript
class VolumeViewer {
    constructor(containerPrefix = '') {
        this.containerPrefix = containerPrefix;
        this.initialized = false;
        this.loading = false;

        // Per-instance volume data
        this.volumeData = null;
        this.dimensions = null;
        this.spacing = null;

        // Per-instance Three.js objects
        this.scenes = {};
        this.cameras = {};
        this.renderers = {};
        // ...
    }

    init(modalitySlug) { /* ... */ }
    dispose() { /* ... */ }
    // ... all methods from original CBCTViewer
}
```

**Key changes from singleton:**
- All state moved to constructor (instance variables)
- Methods converted from `methodName: function()` to class methods
- Each instance manages its own WebGL contexts
- Independent volume data caching per instance

### 2. Backward Compatibility Wrapper

```javascript
window.CBCTViewer = {
    _instance: null,
    containerPrefix: '',

    init: function(modalitySlug) {
        if (this._instance) this._instance.dispose();
        this._instance = new VolumeViewer(this.containerPrefix);
        this._instance.init(modalitySlug);
    },

    dispose: function() {
        if (this._instance) this._instance.dispose();
    },

    // Proxy properties
    get initialized() { return this._instance?.initialized || false; },
    get loading() { return this._instance?.loading || false; }
};
```

### 3. Updated ViewerGrid (static/js/viewer_grid.js)

Simplified from queue-based to direct instantiation:

```javascript
function loadModalityInWindow(windowIndex, modality, fileId) {
    // Dispose existing viewer for this window
    if (existingState.viewerInstance) {
        existingState.viewerInstance.dispose();
    }

    // Create NEW instance for this window
    const viewer = new window.VolumeViewer(containerPrefix);
    windowStates[windowIndex].viewerInstance = viewer;
    viewer.init(modality);
}
```

**Removed:**
- Loading queue (no longer needed)
- Singleton clearing logic
- `waitForViewerReady` polling for singleton

## Bug Fixes During Implementation

### Issue 1: Container ID Mismatch (a68f3fb)
- **Problem:** Container IDs didn't match CBCTViewer expectations
- **Fix:** Added modality prefix to view container IDs

### Issue 2: Display None on Views (228e55a)
- **Problem:** Views div had `display: none`, giving 0 dimensions
- **Fix:** Changed to `display: block`, made Loading an overlay

### Issue 3: Singleton State Overwrite (25c6784)
- **Problem:** Second modality overwrote first's containerPrefix
- **Fix:** Initial queue approach, then full refactor to instances

## Verification Results

All success criteria met:

- [x] Dropped modality loads NIfTI volume
- [x] Window displays axial/sagittal/coronal slices
- [x] User can replace modality by dropping different one
- [x] Multiple windows display simultaneously (exceeded plan expectation!)
- [x] Each window maintains independent state
- [x] Clear via right-click works per window
- [x] Backward compatibility for Maxillo pages

## Technical Details

**Instance Isolation:**
- Each VolumeViewer has its own `this.volumeData` (Float32Array)
- Each has independent `this.renderers` (Three.js WebGLRenderer per orientation)
- Container prefixes ensure unique DOM element IDs (`window0_`, `window1_`, etc.)

**Memory Considerations:**
- Brain MRI volumes: ~50-100MB each in memory
- 4 windows × 100MB = 400MB potential max
- dispose() properly cleans up WebGL contexts

**Performance:**
- Loading time: ~2-5 seconds per volume (network + decompression)
- Rendering: Smooth slice navigation once loaded
- Future improvement: Background preloading (captured as todo)

## Files Changed

**Created (1 file, ~1200 lines):**
- `static/js/modality_viewers/volume_viewer.js` - VolumeViewer ES6 class

**Modified (2 files):**
- `static/js/viewer_grid.js` - Simplified to use VolumeViewer instances
- `templates/brain/patient_detail_content.html` - Added volume_viewer.js script

## Key Learnings

1. **Singleton → Class refactor pattern:** Move all properties to constructor, convert method syntax, add wrapper for backward compatibility.

2. **WebGL context limits:** Browsers limit WebGL contexts (~8-16). Each orientation view uses one context, so 4 windows × 3 views = 12 contexts. Near the limit but works.

3. **Container timing:** Views need visible dimensions before Three.js can initialize. Loading overlay must be positioned absolutely over visible containers, not replace them.

## Phase 3 Complete

All 3 plans in Phase 3 (Viewer Grid) are now complete:

| Plan | Description | Status |
|------|-------------|--------|
| 03-01 | Grid layout foundation | Complete |
| 03-02 | Drag-drop interaction | Complete |
| 03-03 | NIfTI viewer integration | Complete |

**Phase deliverable achieved:** 2x2 grid where users can drag MRI modalities into windows and view them simultaneously.

## Next Phase

Phase 4: Single-View Mode
- Switch from 2x2 slice grid to single orientation per window
- Orientation selector (axial/sagittal/coronal) per window
- Larger view area for detailed examination
