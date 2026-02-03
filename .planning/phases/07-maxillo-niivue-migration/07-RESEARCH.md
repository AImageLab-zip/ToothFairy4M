# Phase 7: Maxillo NiiVue Migration - Research

**Researched:** 2026-02-03
**Domain:** Medical volume viewer migration (Three.js to NiiVue)
**Confidence:** HIGH

## Summary

This research investigates migrating the Maxillo CBCT viewer from the current Three.js-based cbct.js implementation to NiiVue, following the pattern already established in the Brain viewer (viewer_grid.js + niivue_viewer.js). The goal is to unify the codebase, improve performance through GPU-accelerated rendering, and leverage NiiVue's built-in features for medical volume visualization.

The current Three.js implementation (cbct.js, 1565 lines) manually handles NIfTI parsing, slice texture generation, crosshair rendering, and windowing calculations. NiiVue provides these capabilities built-in with GPU shaders, eliminating ~1000 lines of manual rendering code. The Brain viewer already demonstrates successful NiiVue integration with a 2x2 grid layout, single-view instances, and event-driven crosshair synchronization.

Key architectural differences require careful migration: Three.js uses manual CPU-based windowing with percent-based controls (0-100%), while NiiVue uses GPU shaders with calMin/calMax properties for intensity range control. The panoramic view must remain as a separate 2D image display (not migrated to NiiVue). Template structure differs significantly - Brain uses a drag-drop grid with modality chips, while Maxillo uses radio button toggles for fixed viewer positions.

**Primary recommendation:** Adapt the existing NiiVueViewer wrapper class for Maxillo's fixed 2x2 layout, add windowing control adapter methods to map percent-based controls to NiiVue's calMin/calMax API, and preserve the panoramic view as-is.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| NiiVue | v0.67.0 | WebGL2-based medical volume viewer | Already integrated in Brain viewer, GPU-accelerated, handles NIfTI natively |
| Three.js | r169 | 3D rendering library | Currently used in Maxillo (to be replaced) |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| nifti-reader-js | bundled | NIfTI parsing (Three.js path) | Legacy - being phased out, NiiVue handles internally |
| Web Worker API | native | Background NIfTI parsing | Already implemented in Phase 6 for Three.js path, may not be needed with NiiVue |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| NiiVue | Keep Three.js | More code to maintain, no GPU shader acceleration, manual crosshair/windowing |
| NiiVue | Cornerstone | Different API, would require rewriting both viewers, less active development for NIfTI |

**Installation:**
Already installed via CDN in brain/patient_detail_content.html:
```html
<script src="https://cdn.jsdelivr.net/npm/@niivue/niivue@0.67.0/dist/niivue.umd.min.js"></script>
```

## Architecture Patterns

### Recommended Project Structure
```
static/js/
├── modality_viewers/
│   ├── niivue_viewer.js        # ES6 class wrapper (exists)
│   ├── cbct.js                 # Legacy Three.js (to be adapted)
│   └── windowing.js            # Percent-based windowing (exists, needs adapter)
└── viewer_grid.js              # Brain multi-window system (reference)

templates/
├── brain/
│   └── patient_detail_content.html   # Grid pattern (reference)
└── maxillo/
    └── patient_detail_content.html   # Fixed layout (target)
```

### Pattern 1: ES6 Class Wrapper for NiiVue

**What:** Thin ES6 class wrapping NiiVue instance with clean API for medical imaging use cases
**When to use:** Abstracting NiiVue complexity for application-specific needs
**Example:**
```javascript
// Source: /home/llumetti/ToothFairy4M-dev/static/js/modality_viewers/niivue_viewer.js
class NiiVueViewer {
    constructor(containerId) {
        this.containerId = containerId;
        this.nv = null;
        this.initialized = false;
        this.currentOrientation = 'axial';
    }

    async init(modalitySlug, fileBlob) {
        this.nv = new window.niivue.Niivue({
            backColor: [0, 0, 0, 1],
            show3Dcrosshair: false,
            multiplanarForceRender: false,
            isColorbar: false,
            logging: false,
            dragAndDropEnabled: false
        });

        await this.nv.attachToCanvas(canvas);
        const arrayBuffer = await fileBlob.arrayBuffer();
        await this.nv.loadFromArrayBuffer(arrayBuffer, modalitySlug + '.nii.gz');
        this.setOrientation('axial');
    }

    setOrientation(orientation) {
        const sliceType = this.nv[`sliceType${orientation.charAt(0).toUpperCase() + orientation.slice(1)}`];
        this.nv.setSliceType(sliceType);
    }
}
```

### Pattern 2: Event-Driven Synchronization via Custom DOM Events

**What:** Loose coupling between viewer instances using CustomEvent for crosshair sync
**When to use:** Multiple independent viewer instances that need coordinate synchronization
**Example:**
```javascript
// Source: /home/llumetti/ToothFairy4M-dev/static/js/viewer_grid.js (lines 81-105)
function initSynchronization() {
    window.addEventListener('sliceIndexChanged', (event) => {
        if (_isSyncing) return;
        const { windowIndex, crosshairPos } = event.detail;
        if (freeScrollWindows[windowIndex]) return;

        // Store pending sync data (coalesced per frame)
        _syncSourceWindow = windowIndex;
        _syncCrosshairPos[0] = crosshairPos[0];
        _syncCrosshairPos[1] = crosshairPos[1];
        _syncCrosshairPos[2] = crosshairPos[2];

        // Batch with rAF
        if (!_syncRAF) {
            _syncRAF = requestAnimationFrame(applyCrosshairSync);
        }
    });
}

function applyCrosshairSync() {
    _isSyncing = true;
    for (let targetIdx = 0; targetIdx < 4; targetIdx++) {
        if (targetIdx === _syncSourceWindow || freeScrollWindows[targetIdx]) continue;
        const viewer = windowStates[targetIdx].niivueInstance;
        if (viewer && viewer.nv) {
            viewer.nv.scene.crosshairPos[0] = _syncCrosshairPos[0];
            viewer.nv.scene.crosshairPos[1] = _syncCrosshairPos[1];
            viewer.nv.scene.crosshairPos[2] = _syncCrosshairPos[2];
            viewer.nv.drawScene();  // Fast GPU-only redraw
        }
    }
    _isSyncing = false;
}
```

### Pattern 3: Fixed 2x2 Layout with Orientation Assignment

**What:** Pre-assigned orientations in fixed grid positions (Maxillo pattern)
**When to use:** When orientations are predetermined and users don't need to customize layouts
**Example:**
```javascript
// Maxillo pattern (to be implemented):
// Fixed assignment: Axial (top-left), Sagittal (top-right), Coronal (bottom-left), 3D placeholder (bottom-right)
const FIXED_LAYOUT = {
    axialView: { orientation: 'axial', windowIndex: 0 },
    sagittalView: { orientation: 'sagittal', windowIndex: 1 },
    coronalView: { orientation: 'coronal', windowIndex: 2 },
    volumeView: { type: 'placeholder', windowIndex: 3 }
};

// All three 2D views sync together (Brain pattern applies)
```

### Pattern 4: Windowing Control Adapter

**What:** Map percent-based windowing (0-100%) to NiiVue's calMin/calMax properties
**When to use:** Preserving existing UI controls while adopting NiiVue backend
**Example:**
```javascript
// Adapter pattern (to be implemented):
function updateWindowingFromPercent(viewer, percentMin, percentMax) {
    const volume = viewer.nv.volumes[0];
    if (!volume) return;

    // NiiVue volumes have cal_min and cal_max properties for display range
    const dataMin = volume.global_min;  // actual data range
    const dataMax = volume.global_max;

    // Map percent to absolute values
    volume.cal_min = dataMin + (dataMax - dataMin) * (percentMin / 100);
    volume.cal_max = dataMin + (dataMax - dataMin) * (percentMax / 100);

    // Trigger GPU shader update
    viewer.nv.updateGLVolume();
}
```

### Anti-Patterns to Avoid

- **Manual slice texture generation:** NiiVue handles this via GPU shaders - don't replicate the Three.js CPU-based approach
- **Custom crosshair rendering:** Use NiiVue's built-in crosshair system (`opts.crosshairWidth`) instead of Three.js line geometry
- **Blocking NIfTI parsing:** NiiVue's `loadFromArrayBuffer` is already async - don't add extra Worker complexity unless profiling shows need
- **Mixing Three.js and NiiVue:** Complete migration per view - no hybrid rendering (panoramic view stays as pure image, not Three.js)

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Slice texture generation | CPU-based pixel mapping with DataTexture | NiiVue's GPU shaders | Edge cases: oblique angles, non-standard orientations, resampling. NiiVue handles via fragment shaders. |
| Crosshair rendering | Three.js Line geometry with manual coordinate calculation | NiiVue's `opts.crosshairWidth` and `scene.crosshairPos` | Edge cases: aspect ratio corrections, zoom handling, multi-planar intersection math. Built-in. |
| NIfTI parsing | nifti-reader-js + manual datatype handling | NiiVue's `loadFromArrayBuffer` | Edge cases: compressed files, unusual datatypes (int64, complex), qform/sform transforms. NiiVue tested on thousands of datasets. |
| Window/level adjustment | Manual pixel remapping on CPU | NiiVue's `volumes[0].cal_min`/`cal_max` with GPU shaders | Edge cases: real-time interaction performance, gamma correction, non-linear mappings. GPU is 10-100x faster. |

**Key insight:** Medical volume rendering has solved problems around NIfTI format edge cases (header variants, coordinate systems, compression) that are non-obvious. NiiVue encapsulates this domain knowledge from years of real-world use.

## Common Pitfalls

### Pitfall 1: Assuming NiiVue API Matches Three.js Patterns

**What goes wrong:** Trying to control NiiVue rendering with Three.js mental models (scene graphs, manual render loops, mesh materials)
**Why it happens:** Previous experience with Three.js makes developers assume similar low-level control
**How to avoid:** Treat NiiVue as a higher-level medical imaging library - use its declarative API (`setSliceType`, `setOpacity`) rather than trying to access internal WebGL state
**Warning signs:** Code trying to access `nv.gl` context directly, attempting to create custom shaders, manual render loops instead of `drawScene()`

### Pitfall 2: Over-Engineering Windowing Controls

**What goes wrong:** Building complex windowing UI with histogram visualization, preset buttons, real-time preview
**Why it happens:** Trying to match advanced PACS viewer features from the start
**How to avoid:** Start with simple min/max sliders that map to calMin/calMax. Current cbct.js uses 0-100% sliders - keep this UX, just adapt the backend
**Warning signs:** Adding histogram.js libraries, custom canvas overlays, debouncing complexity beyond simple input handlers

### Pitfall 3: Breaking Panoramic Image Display

**What goes wrong:** Assuming panoramic view should also migrate to NiiVue or trying to integrate it into the same canvas
**Why it happens:** Desire for architectural consistency
**How to avoid:** Keep panoramic as a separate `<img>` element with independent zoom/pan controls. It's a 2D image, not a volume - different domain
**Warning signs:** Attempts to load panoramic into NiiVue, canvas overlays trying to combine both, shared interaction handlers

### Pitfall 4: Losing Crosshair Synchronization During Migration

**What goes wrong:** Three orthogonal views (axial, sagittal, coronal) stop updating together when one is scrolled
**Why it happens:** Missing `onLocationChange` callback setup or incorrect crosshairPos assignment
**How to avoid:** Set up `viewer.onSliceChange()` callback immediately after init, ensure full 3D crosshairPos array `[x, y, z]` is synced (not just slice index)
**Warning signs:** Views update in isolation, scrolling axial doesn't move sagittal/coronal crosshairs, `onLocationChange` is null

### Pitfall 5: Template Structure Mismatch with Brain Viewer

**What goes wrong:** Copying Brain's drag-drop grid pattern directly to Maxillo breaks the UI
**Why it happens:** Assuming template structure should be identical between projects
**How to avoid:** Recognize that Brain uses flexible grid (any modality in any window) while Maxillo uses fixed layout (specific orientations in specific positions). Adapt the NiiVueViewer class, not the template structure
**Warning signs:** Adding modality chips to Maxillo, removing radio button toggles, introducing drag-drop when it's not in requirements

## Code Examples

Verified patterns from official sources:

### Loading Volume from Pre-Fetched Blob

```javascript
// Source: /home/llumetti/ToothFairy4M-dev/static/js/modality_viewers/niivue_viewer.js (lines 67-71)
// NiiVue requires blob data, not URLs - fetch first, then load
const arrayBuffer = await fileBlob.arrayBuffer();
await this.nv.loadFromArrayBuffer(arrayBuffer, modalitySlug + '.nii.gz');
// Name must end in .nii.gz for NiiVue to select correct parser
```

### Setting Orientation in Single-View Mode

```javascript
// Source: /home/llumetti/ToothFairy4M-dev/static/js/modality_viewers/niivue_viewer.js (lines 82-112)
setOrientation(orientation) {
    const normalizedOrientation = orientation.toLowerCase();
    let sliceType;

    switch (normalizedOrientation) {
        case 'axial':
            sliceType = this.nv.sliceTypeAxial;  // Value: 2
            break;
        case 'sagittal':
            sliceType = this.nv.sliceTypeSagittal;  // Value: 1
            break;
        case 'coronal':
            sliceType = this.nv.sliceTypeCoronal;  // Value: 0
            break;
    }

    this.nv.setSliceType(sliceType);
    this.currentOrientation = normalizedOrientation;
}
```

### Getting/Setting Slice Index with Crosshair Position

```javascript
// Source: /home/llumetti/ToothFairy4M-dev/static/js/modality_viewers/niivue_viewer.js (lines 119-148, 154-184)
getSliceIndex() {
    const crosshair = this.nv.scene.crosshairPos;  // [x, y, z] in 0-1 normalized space
    const dims = this.nv.volumes[0].dimsRAS;

    switch (this.currentOrientation) {
        case 'axial':
            return Math.round(crosshair[2] * (dims[3] - 1));  // Z axis
        case 'sagittal':
            return Math.round(crosshair[0] * (dims[1] - 1));  // X axis
        case 'coronal':
            return Math.round(crosshair[1] * (dims[2] - 1));  // Y axis
    }
}

setSliceIndex(index) {
    const dims = this.nv.volumes[0].dimsRAS;
    const crosshair = [...this.nv.scene.crosshairPos];

    switch (this.currentOrientation) {
        case 'axial':
            crosshair[2] = Math.min(Math.max(index / (dims[3] - 1), 0), 1);
            break;
        case 'sagittal':
            crosshair[0] = Math.min(Math.max(index / (dims[1] - 1), 0), 1);
            break;
        case 'coronal':
            crosshair[1] = Math.min(Math.max(index / (dims[2] - 1), 0), 1);
            break;
    }

    this.nv.scene.crosshairPos = crosshair;
    this.nv.updateGLVolume();  // OR nv.drawScene() for lighter update
}
```

### Performance-Optimized Crosshair Sync with drawScene

```javascript
// Source: /home/llumetti/ToothFairy4M-dev/static/js/viewer_grid.js (lines 113-145)
// rAF throttling + drawScene instead of updateGLVolume
function applyCrosshairSync() {
    _syncRAF = null;
    _isSyncing = true;

    for (let targetIdx = 0; targetIdx < 4; targetIdx++) {
        if (targetIdx === _syncSourceWindow || freeScrollWindows[targetIdx]) continue;

        const targetViewer = windowStates[targetIdx].niivueInstance;
        if (targetViewer && targetViewer.isReady() && targetViewer.nv) {
            // Direct array write - no allocation
            const pos = targetViewer.nv.scene.crosshairPos;
            pos[0] = _syncCrosshairPos[0];
            pos[1] = _syncCrosshairPos[1];
            pos[2] = _syncCrosshairPos[2];

            // drawScene() = GPU-only redraw (fast)
            // updateGLVolume() = texture rebuild + GPU draw (slow)
            targetViewer.nv.drawScene();
        }
    }

    _isSyncing = false;
}
```

### NiiVue Initialization Options for Medical Imaging

```javascript
// Source: /home/llumetti/ToothFairy4M-dev/static/js/modality_viewers/niivue_viewer.js (lines 49-56)
this.nv = new window.niivue.Niivue({
    backColor: [0, 0, 0, 1],           // Black background (medical imaging convention)
    show3Dcrosshair: false,             // No 3D crosshair in single-view mode
    multiplanarForceRender: false,      // Single view mode (not multi-planar)
    isColorbar: false,                  // No colorbar for simple viewing
    logging: false,                     // Disable console logging
    dragAndDropEnabled: false           // Grid handles drag-drop, not NiiVue
});
```

### Windowing Calculation (Current Three.js Pattern)

```javascript
// Source: /home/llumetti/ToothFairy4M-dev/static/js/modality_viewers/windowing.js (lines 71-90)
// This calculation pattern needs to be adapted to set NiiVue's calMin/calMax
VolumeWindowing.prototype.calculateParams = function () {
    var histMin = this.histMin;  // Actual data range minimum
    var histMax = this.histMax;  // Actual data range maximum
    var pMin = Math.max(0, Math.min(100, this.percentMin));
    var pMax = Math.max(0, Math.min(100, this.percentMax));
    var lowP = Math.min(pMin, pMax);
    var highP = Math.max(pMin, pMax);

    // Map percent to absolute HU values
    var windowMin = histMin + (histMax - histMin) * (lowP / 100.0);
    var windowMax = histMin + (histMax - histMin) * (highP / 100.0);
    var windowRange = Math.max(0.001, windowMax - windowMin);

    return { windowMin, windowMax, windowRange };
};
// NiiVue equivalent: set volumes[0].cal_min = windowMin, volumes[0].cal_max = windowMax
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| CPU-based slice rendering with Three.js DataTexture | GPU shader-based rendering via NiiVue | Brain viewer (Phase 4, Jan 2026) | 10-100x faster slice updates, eliminates manual texture generation code |
| Manual crosshair line geometry with Three.js | Built-in NiiVue crosshair with scene.crosshairPos | Brain viewer (Phase 4, Jan 2026) | ~200 lines of crosshair code eliminated, automatic aspect ratio handling |
| nifti-reader-js parsing + manual datatype handling | NiiVue's loadFromArrayBuffer with built-in parsing | Brain viewer (Phase 4, Jan 2026) | Handles edge cases (qform/sform, oblique angles) automatically |
| updateGLVolume() on every crosshair change | drawScene() for sync, updateGLVolume() only for data changes | Brain viewer (Phase 5, Jan 2026) | Sync performance improved by avoiding texture recalculation |
| VolumeViewer monolith (1387 lines) | Modular architecture (windowing, loader, renderer, interaction) | Phase 6 refactoring (Feb 2026) | Enables selective migration, clearer separation of concerns |

**Deprecated/outdated:**
- **Three.js manual volume rendering:** NiiVue provides GPU-accelerated solution with medical imaging domain knowledge
- **nifti-reader-js standalone usage:** NiiVue bundles and extends this internally with better error handling
- **Custom windowing calculations in render loop:** Move to declarative calMin/calMax updates with NiiVue

## Open Questions

Things that couldn't be fully resolved:

1. **NiiVue 0.67.0 vs 0.66.0 differences**
   - What we know: Brain viewer uses 0.67.0 via CDN, export issues existed in 0.66.0
   - What's unclear: Specific API changes between versions, changelog verification
   - Recommendation: Stick with 0.67.0 as established in Brain viewer (STATE.md line 86), avoid version changes during migration

2. **Performance impact of removing Web Worker NIfTI parsing**
   - What we know: Phase 6 implemented Web Worker for Three.js path, NiiVue has internal async loading
   - What's unclear: Whether NiiVue's loadFromArrayBuffer blocks main thread enough to warrant Worker wrapper
   - Recommendation: Profile NiiVue loading first, add Worker wrapper only if >100ms blocking detected

3. **Windowing control preservation vs. NiiVue native controls**
   - What we know: Current UI has 0-100% sliders, NiiVue has right-click drag for window/level
   - What's unclear: User preference for existing sliders vs. NiiVue's interactive drag
   - Recommendation: Keep existing slider UI (adapter approach), optionally enable NiiVue's right-click later based on user feedback

4. **3D Volume rendering placeholder vs. actual implementation**
   - What we know: Current cbct.js shows "Not yet supported" for 3D view, NiiVue can render 3D volumes
   - What's unclear: Whether Phase 7 scope includes implementing 3D rendering or keeping placeholder
   - Recommendation: Success criteria states "3D placeholder views" - keep as placeholder for Phase 7, defer actual 3D to future phase

5. **Modality-specific windowing presets**
   - What we know: CBCT has bone/tissue-specific HU ranges, current implementation is generic
   - What's unclear: Whether to add preset buttons (Bone: 400-3000 HU, Soft Tissue: -200-300 HU)
   - Recommendation: Not in success criteria - defer to post-migration enhancement

## Sources

### Primary (HIGH confidence)
- Codebase files:
  - `/home/llumetti/ToothFairy4M-dev/static/js/modality_viewers/cbct.js` - Current Three.js implementation (1565 lines)
  - `/home/llumetti/ToothFairy4M-dev/static/js/modality_viewers/niivue_viewer.js` - ES6 wrapper class (280 lines)
  - `/home/llumetti/ToothFairy4M-dev/static/js/viewer_grid.js` - Brain multi-window system (1043 lines)
  - `/home/llumetti/ToothFairy4M-dev/static/js/modality_viewers/windowing.js` - Percent-based windowing (130 lines)
- Project documentation:
  - `.planning/STATE.md` - Phase 6 decisions, NiiVue version (0.67.0)
  - `.planning/phases/06-volumeviewer-refactoring/06-01-SUMMARY.md` - Modular architecture patterns
- Templates:
  - `/home/llumetti/ToothFairy4M-dev/templates/brain/patient_detail_content.html` - Grid drag-drop pattern
  - `/home/llumetti/ToothFairy4M-dev/templates/maxillo/patient_detail_content.html` - Fixed layout pattern

### Secondary (MEDIUM confidence)
- [NiiVue API Documentation - Class: Niivue](https://niivue.com/docs/api/niivue/classes/Niivue/) - Initialization options, methods
- [NiiVue Loading Volumes and Meshes](https://niivue.com/docs/loading/) - `loadFromArrayBuffer` usage
- [NiiVue Layouts and Slice Types](https://niivue.com/docs/layouts/) - Orientation control, single-view mode
- [NIfTI cal_min/cal_max documentation](https://nifti.nimh.nih.gov/nifti-1/documentation/nifti1fields/nifti1fields_pages/cal_maxmin.html) - Display intensity mapping
- [ipyniivue Traits documentation](https://niivue.github.io/ipyniivue/traits.html) - cal_min/cal_max configuration options

### Tertiary (LOW confidence)
- WebSearch results for "NiiVue window level contrast brightness" - Generic descriptions, not API-specific
- GitHub releases page (no specific 0.67.0 changelog found) - Version differences unclear

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - NiiVue 0.67.0 already integrated in Brain viewer, proven working
- Architecture: HIGH - Existing NiiVueViewer wrapper and viewer_grid.js patterns are production-tested
- Pitfalls: MEDIUM - Based on Three.js to NiiVue comparison and common medical viewer mistakes, not Maxillo-specific migration experience
- Windowing adapter: MEDIUM - Pattern is clear from VolumeWindowing.js but NiiVue calMin/calMax interaction not directly tested in codebase yet

**Research date:** 2026-02-03
**Valid until:** 2026-03-05 (30 days - NiiVue is stable, not fast-moving)
