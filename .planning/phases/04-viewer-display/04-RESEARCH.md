# Phase 4: Viewer Display - Research

**Researched:** 2026-01-28
**Domain:** NIfTI medical imaging viewer, single-view orientation switching, volume caching, mouse navigation
**Confidence:** HIGH

## Summary

Phase 4 requires switching from the current custom VolumeViewer (which displays a 2x2 internal grid of axial/sagittal/coronal views within each window) to **NiiVue-based single-view mode** where each window displays ONE orientation at a time, with a per-window menu to switch between axial, sagittal, and coronal views.

The key decision point: **Requirements explicitly specify NiiVue for DISP-01**. This is a significant architectural change from the current Three.js-based VolumeViewer that has been working since Phase 3.

**Key findings:**

1. **NiiVue is purpose-built for medical imaging** - WebGL2-based, optimized for voxel rendering, designed for neuroimaging workflows
2. **Single-view orientation switching is a core NiiVue feature** via `setSliceType()` API
3. **Mouse wheel scrolling is standard NiiVue behavior** for slice navigation
4. **Volume caching is built into NiiVue** - volumes loaded once stay in memory for fast re-access
5. **NiiVue does NOT use Three.js** - it has its own WebGL2 rendering pipeline optimized for medical imaging

**Primary recommendation:** Replace VolumeViewer with NiiVue instances. This is NOT a simple "refactor to single-view mode" — it's a full library swap. However, this aligns with Phase 4 requirements and provides significant advantages: better performance for medical imaging, native support for multi-format volumes, and established best practices for neuroimaging visualization.

**Migration path:** Create new NiiVue-based viewer module in parallel, test end-to-end, then swap out VolumeViewer references in viewer_grid.js. The grid infrastructure from Phase 3 (drag-drop, window state, modality loading) remains unchanged.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| NiiVue | 0.66.0 (latest as of Jan 2026) | WebGL2-based medical image viewer | Explicitly required in DISP-01; purpose-built for neuroimaging; optimized for 2D slice viewing |
| WebGL 2.0 | Native | Rendering pipeline | NiiVue uses WebGL2 natively (no Three.js wrapper) for better performance |
| Bootstrap | 5.3.0 | Grid layout, UI components | Already in project for other viewers |
| Vanilla JavaScript | ES6+ | Integration and state management | Project standard; no build step needed |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Font Awesome | 6.0.0 | Icons for orientation buttons and menus | Already in project, used for UI |
| Django REST | N/A | File serving API | Already implemented at `/api/processing/files/serve/{file_id}/` |

### What Changes from Phase 3
- **Remove:** VolumeViewer (custom Three.js-based) - replaced by NiiVue
- **Add:** NiiVue library (npm package or CDN)
- **Keep:** viewer_grid.js drag-drop logic, window state management, file loading API integration

**Installation:**
```bash
npm install @niivue/niivue
# OR use via CDN if preferred
<script src="https://cdn.jsdelivr.net/npm/@niivue/niivue@0.66.0/dist/niivue.min.js"></script>
```

## Architecture Patterns

### Recommended Project Structure

```
static/
├── js/
│   ├── modality_viewers/
│   │   ├── niivue_viewer.js          # NEW: NiiVue wrapper for Phase 4
│   │   ├── volume_viewer.js          # DEPRECATED: Phase 3 viewer (remove in Phase 4)
│   │   └── [other viewers unchanged]
│   ├── viewer_grid.js                # Updated: Call NiiVueViewer instead of VolumeViewer
│   └── patient_detail.js             # Unchanged
├── css/
│   ├── viewer_grid.css               # Updated: Adjust for single-view containers
│   └── niivue_viewer.css             # NEW: NiiVue-specific styling
```

### Pattern 1: NiiVue Single-View Instance

**What:** Each window gets its own NiiVue instance configured for single-view (one orientation at a time).

**When to use:** For displaying brain MRI volumes with clinician-friendly orientation switching.

**Architecture:**

```javascript
class NiiVueViewer {
    constructor(containerId) {
        this.containerId = containerId;
        this.nv = null;                    // NiiVue instance
        this.currentOrientation = 'axial'; // Track current view
        this.volumeData = null;            // Cached volume blob
        this.initialized = false;
    }

    async init(modalitySlug, fileBlob) {
        // 1. Create NiiVue instance for this container
        this.nv = new niivue.Niivue({
            canvas: document.getElementById(this.containerId),
            opts: {
                multiplanar: false  // Single-view mode, not 2x2 grid
            }
        });

        // 2. Load volume data
        this.volumeData = fileBlob;
        const imageList = [{ url: fileBlob, name: modalitySlug }];
        await this.nv.loadImages(imageList);

        // 3. Set default to axial
        this.nv.setSliceType(this.nv.sliceTypeAxial);
        this.currentOrientation = 'axial';

        this.initialized = true;
    }

    setOrientation(orientation) {
        // Switch between axial, sagittal, coronal
        const sliceTypeMap = {
            'axial': this.nv.sliceTypeAxial,
            'sagittal': this.nv.sliceTypeSagittal,
            'coronal': this.nv.sliceTypeCoronal
        };

        if (sliceTypeMap[orientation]) {
            this.nv.setSliceType(sliceTypeMap[orientation]);
            this.currentOrientation = orientation;
        }
    }

    dispose() {
        if (this.nv) {
            try { this.nv.dispose?.(); } catch (e) { }
        }
        this.initialized = false;
        this.volumeData = null;
    }
}
```

### Pattern 2: Orientation Menu per Window

**UI structure:**
- Each window shows a button/dropdown menu: "Axial | Sagittal | Coronal" (or radio buttons)
- Menu is positioned in window header or corner
- Clicking switches `setOrientation()` call

**Implementation:**
```javascript
// In viewer_grid.js loadModalityInWindow():
const viewer = new window.NiiVueViewer(containerId);
await viewer.init(modality, fileBlob);

// Create orientation menu
const orientationMenu = createOrientationMenu(windowIndex, viewer);
windowEl.appendChild(orientationMenu);

function createOrientationMenu(windowIndex, viewer) {
    const menu = document.createElement('div');
    menu.className = 'orientation-menu';

    ['axial', 'sagittal', 'coronal'].forEach(orientation => {
        const btn = document.createElement('button');
        btn.textContent = orientation.charAt(0).toUpperCase() + orientation.slice(1);
        btn.onclick = () => {
            viewer.setOrientation(orientation);
            // Update button active state
            menu.querySelectorAll('button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        };
        if (orientation === 'axial') btn.classList.add('active');
        menu.appendChild(btn);
    });

    return menu;
}
```

### Pattern 3: Volume Caching Strategy

**Current Phase 3 approach:**
- VolumeViewer caches volumeData in memory (Float32Array)
- Re-initializing same modality reuses cached data instead of reloading

**NiiVue approach:**
- NiiVue manages volume data internally after `loadImages()`
- Keep NiiVue instance alive in windowStates to preserve cache
- If replacing modality, dispose old instance (clears memory)
- If re-loading same modality in same window, instance already has data

**Implementation:**
```javascript
// viewer_grid.js windowStates
windowStates[windowIndex] = {
    modality: 'T1',
    fileId: 42,
    niivueInstance: viewerInstance,  // Keep instance for caching
    currentOrientation: 'axial',
    loading: false,
    error: null
};

// When clearing window:
function clearWindow(windowIndex) {
    const state = windowStates[windowIndex];
    if (state.niivueInstance) {
        state.niivueInstance.dispose();
    }
    windowStates[windowIndex] = {
        modality: null,
        fileId: null,
        niivueInstance: null,
        currentOrientation: 'axial',
        loading: false,
        error: null
    };
    updateWindowUI(windowIndex);
}
```

### Pattern 4: Mouse Scroll for Slice Navigation

**NiiVue default behavior:**
- Mouse wheel automatically scrolls through slices (built-in)
- No additional code needed to enable

**Customization if needed:**
- NiiVue exposes scroll events that can be intercepted
- Can add constraints (e.g., slow down scroll speed for clinical precision)
- Can add visual feedback (slice indicator overlay)

### Anti-Patterns to Avoid

- **Keeping VolumeViewer alongside NiiVue:** Confuses two rendering systems; causes duplicate memory usage and WebGL context waste. Choose one.
- **Creating NiiVue instance per orientation:** Each window should have ONE NiiVue instance that changes views, not three instances running in parallel.
- **Re-loading volume blob on orientation switch:** NiiVue is already optimized for this; just call `setSliceType()`.
- **Hardcoding slice limits:** NiiVue calculates these from volume dimensions automatically.
- **Not disposing old instance before creating new one:** Memory leak risk; always `dispose()` before replacing viewer.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| WebGL slice rendering | Custom shader pipeline | NiiVue WebGL2 renderer | NiiVue's renderer is optimized for medical imaging; custom shaders risk incorrect windowing/leveling |
| Mouse wheel slice control | Custom event handler | NiiVue built-in scroll handler | NiiVue handles hardware differences and acceleration; custom code is brittle |
| Multi-format volume support | File format parser + renderer | NiiVue with plugin system | NiiVue supports 30+ formats; home-rolled parsers fail on edge cases |
| Orientation constants | Magic strings like 'axial' | NiiVue `sliceTypeAxial`, `sliceTypeSagittal`, `sliceTypeCoronal` | Constants prevent typos; ensure API compatibility |
| Volume data caching | Manual memory management | NiiVue instance caching | NiiVue handles WebGL memory lifecycle; manual cache risks leaks or corruption |

**Key insight:** NiiVue exists specifically because medical imaging visualization is complex enough to warrant a specialized library. The effort to replicate even basic NiiVue features (shader pipeline, format parsing, memory management) significantly exceeds the effort to integrate the library.

## Common Pitfalls

### Pitfall 1: Confusion Between VolumeViewer (Phase 3) and NiiVue (Phase 4)

**What goes wrong:** Developers assume Phase 4 is just "refactor VolumeViewer to single-view mode" and try to modify existing code. Tests fail because NiiVue has completely different API.

**Why it happens:** Phase 3's VolumeViewer works and is fresh in memory; easy to assume Phase 4 extends it.

**How to avoid:** Treat NiiVue as a new third-party library, not an evolution of VolumeViewer. Create separate `niivue_viewer.js` module. Don't modify `volume_viewer.js`.

**Warning signs:** Code mixing VolumeViewer methods with NiiVue API; "setSliceType is not a function" errors; two separate viewer systems running simultaneously.

### Pitfall 2: NiiVue as Drop-in Replacement

**What goes wrong:** Attempts to use NiiVue exactly like VolumeViewer (e.g., calling `init(modalitySlug)` expecting it to fetch the file). NiiVue requires explicit file blob/URL.

**Why it happens:** API surface looks similar (both take container + modality), but input contract is different.

**How to avoid:**
- VolumeViewer: `viewer.init(modalitySlug)` → viewer fetches file from API
- NiiVue: `nv.loadImages([{url: fileBlob, name: modalitySlug}])` → caller must provide blob

Template must pass blob to NiiVue instance, not just modality slug.

**Warning signs:** File never loads in NiiVue windows; no errors in console (NiiVue silently fails on invalid input).

### Pitfall 3: WebGL Context Exhaustion

**What goes wrong:** Creating many NiiVue instances leads to "too many WebGL contexts" error and browser crashes.

**Why it happens:** Each NiiVue instance allocates a WebGL2 context. Browsers limit to ~8-16 total.

**How to avoid:**
- Only 4 windows, each with 1 NiiVue instance = 4 contexts (safe)
- Always `dispose()` before replacing instance
- Don't create hidden/test instances

**Warning signs:** Page crashes after loading 3-4 modalities; "WebGL context lost" errors; performance cliff.

### Pitfall 4: Mixing Old and New Viewer Code

**What goes wrong:** Drag-drop system tries to use VolumeViewer in some places, NiiVue in others. State management breaks.

**Why it happens:** Incomplete migration; developer creates `niivue_viewer.js` but doesn't fully update `viewer_grid.js`.

**How to avoid:**
1. Identify all references to `window.VolumeViewer` in code
2. Create new `loadModalityInWindow()` that uses NiiVue
3. Update windowStates to track `niivueInstance` instead of `viewerInstance`
4. Test complete flow: drag → load → display → switch orientation → clear

**Warning signs:** "VolumeViewer is not defined" mixed with working NiiVue windows; some windows load, others don't.

### Pitfall 5: Orientation Menu State Desync

**What goes wrong:** User switches orientation in NiiVue, but menu button doesn't update. User gets confused about current view.

**Why it happens:** Menu state lives in DOM; NiiVue state lives in instance. No synchronization.

**How to avoid:**
- Track orientation in window state object: `windowStates[i].currentOrientation`
- On menu click, update both NiiVue (`setSliceType()`) AND state object
- Reconstruct menu UI after state change to reflect current orientation

**Warning signs:** Menu shows "Axial" but window displays sagittal slices.

## Code Examples

Verified patterns from official sources:

### Example 1: NiiVue Instance Creation and Load

```javascript
// Source: https://niivue.com/docs/
const nv = new niivue.Niivue({
    canvas: document.getElementById('gl'),
    opts: {
        multiplanar: false,  // Single-view, not 2x2 grid
        logging: false       // Disable debug logging
    }
});

// Load volume from blob or URL
const imageList = [{
    url: fileBlob,           // File blob from drag-drop or API
    name: 'T1'              // Modality slug for reference
}];

await nv.loadImages(imageList);

// Set default orientation
nv.setSliceType(nv.sliceTypeAxial);
```

### Example 2: Orientation Switching

```javascript
// Source: https://niivue.com/docs/layouts/
const orientationMap = {
    'axial': nv.sliceTypeAxial,
    'sagittal': nv.sliceTypeSagittal,
    'coronal': nv.sliceTypeCoronal
};

function switchOrientation(orientation) {
    if (orientationMap[orientation]) {
        nv.setSliceType(orientationMap[orientation]);
        // Optional: update UI to show current orientation
        updateOrientationMenu(orientation);
    }
}
```

### Example 3: Dispose and Cleanup

```javascript
// Source: NiiVue API pattern
function clearWindow(windowIndex) {
    const state = windowStates[windowIndex];

    if (state.niivueInstance) {
        try {
            state.niivueInstance.dispose?.();
        } catch (e) {
            console.warn('Error disposing NiiVue:', e);
        }
    }

    // Reset window state
    windowStates[windowIndex] = {
        modality: null,
        fileId: null,
        niivueInstance: null,
        currentOrientation: 'axial',
        loading: false,
        error: null
    };

    // Clear UI
    const windowEl = document.querySelector(`[data-window-index="${windowIndex}"]`);
    windowEl.innerHTML = '<div class="drop-hint">Drop modality here</div>';
}
```

### Example 4: Drag-Drop to NiiVue Load Integration

```javascript
// Source: Phase 3 viewer_grid.js pattern + NiiVue API
async function loadModalityInWindow(windowIndex, modality, fileId) {
    const windowEl = document.querySelector(`[data-window-index="${windowIndex}"]`);
    const state = windowStates[windowIndex];

    // Clean up old instance
    if (state.niivueInstance) {
        state.niivueInstance.dispose();
    }

    // Mark loading
    state.loading = true;
    state.error = null;
    windowEl.innerHTML = '<div class="spinner-border"></div>';

    try {
        // 1. Fetch file blob from API
        const response = await fetch(`/api/processing/files/serve/${fileId}/`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const fileBlob = await response.blob();

        // 2. Create canvas container for NiiVue
        const canvasId = `niivue-canvas-window${windowIndex}`;
        windowEl.innerHTML = `<canvas id="${canvasId}" style="width: 100%; height: 100%;"></canvas>
                             <div class="orientation-menu">
                                 <button data-orientation="axial" class="active">Axial</button>
                                 <button data-orientation="sagittal">Sagittal</button>
                                 <button data-orientation="coronal">Coronal</button>
                             </div>`;

        // 3. Create NiiVue instance
        const nv = new niivue.Niivue({
            canvas: document.getElementById(canvasId),
            opts: { multiplanar: false }
        });

        // 4. Load volume
        await nv.loadImages([{ url: fileBlob, name: modality }]);
        nv.setSliceType(nv.sliceTypeAxial);

        // 5. Attach orientation menu handlers
        const menuBtns = windowEl.querySelectorAll('.orientation-menu button');
        menuBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const orientation = btn.dataset.orientation;
                const sliceTypeMap = {
                    'axial': nv.sliceTypeAxial,
                    'sagittal': nv.sliceTypeSagittal,
                    'coronal': nv.sliceTypeCoronal
                };
                nv.setSliceType(sliceTypeMap[orientation]);

                // Update button state
                menuBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.currentOrientation = orientation;
            });
        });

        // 6. Update state
        state.modality = modality;
        state.fileId = fileId;
        state.niivueInstance = nv;
        state.currentOrientation = 'axial';
        state.loading = false;

    } catch (error) {
        state.error = error.message;
        state.loading = false;
        windowEl.innerHTML = `<div class="error-text">${error.message}</div>
                             <button onclick="retryLoad(${windowIndex})">Retry</button>`;
    }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Custom Three.js medical viewer | Specialized WebGL2 medical imaging library (NiiVue) | Phase 4 | Native support for 30+ medical formats, optimized shaders, better performance |
| 2x2 slice grid per window | Single-view orientation switching per window | Phase 4 | Larger viewing area per modality, familiar radiology UI, easier interaction |
| VolumeViewer singleton | Multiple NiiVue instances (one per window) | Phase 4 | True independent multi-window support, cleaner instance management |
| Manual volume loading | NiiVue's universal loader | Phase 4 | Automatic format detection, built-in decompression (gzip), simpler code |

**Deprecated/outdated:**
- VolumeViewer (Phase 3) — replaced entirely by NiiVue
- Manual WebGL context management — NiiVue handles internally
- Custom slice rendering logic — NiiVue's fragment shaders handle windowing/leveling

## Open Questions

1. **Browser compatibility for NiiVue**
   - What we know: NiiVue requires WebGL2; works on desktop browsers (Chrome, Firefox, Safari)
   - What's unclear: Mobile/tablet support (mentioned as out-of-scope for v1, but worth confirming)
   - Recommendation: Confirm browser matrix with stakeholders; may need fallback for older IE/Edge

2. **Large volume handling (brain MRI > 200MB)**
   - What we know: NiiVue has built-in volume parsing; caches volumes in memory
   - What's unclear: Performance characteristics for very large volumes; streaming vs. full load
   - Recommendation: Test with actual brain MRI files; may need background preloading for Phase 4b

3. **DICOM support for brain MRI**
   - What we know: Requirements specify .nii.gz (NIfTI format); NiiVue supports DICOM via plugin
   - What's unclear: Whether future phases require DICOM support
   - Recommendation: NiiVue handles this natively if needed; no additional work required

4. **Crosshair synchronization (Phase 5 requirement)**
   - What we know: Phase 5 requires synchronized scrolling; Phase 4 should support independent windows
   - What's unclear: How to sync crosshair positions across multiple NiiVue instances
   - Recommendation: Defer detailed analysis to Phase 5 research; NiiVue instances expose coordinate data for this

## Sources

### Primary (HIGH confidence)

- **NiiVue Official Documentation** - https://niivue.com/docs/
  - Layouts and single-view configuration
  - Volume loading methods
  - API reference for `setSliceType()`, `loadImages()`, `dispose()`

- **NiiVue GitHub Repository** - https://github.com/niivue/niivue
  - Latest version: 0.66.0 (Dec 14, 2025)
  - Source code and architecture
  - WebGL2 implementation details

- **NiiVue NPM Package** - @niivue/niivue
  - Installation: `npm install @niivue/niivue`
  - Latest: v0.66.0

- **ToothFairy4M Phase 3 Implementation**
  - `/static/js/modality_viewers/volume_viewer.js` (1386 lines) - Current custom viewer
  - `/static/js/viewer_grid.js` - Drag-drop state management (reusable)
  - `/templates/brain/patient_detail_content.html` - Current UI structure

- **ToothFairy4M Requirements**
  - `.planning/REQUIREMENTS.md` - DISP-01 explicitly requires NiiVue
  - `.planning/ROADMAP.md` - Phase 4 scope: "Integrate NiiVue for multi-plane volume viewing"

### Secondary (MEDIUM confidence)

- **WebSearch: NiiVue vs Three.js** (https://github.com/niivue/niivue)
  - NiiVue uses WebGL2 natively (no Three.js wrapper)
  - Performance advantages for medical imaging
  - Source: GitHub repositories and technical documentation

- **Medical Imaging Viewer Comparison** (WebSearch)
  - NiiVue, Papaya, BrainBrowser compared
  - NiiVue adopted by major platforms (AFNI, FSL, BrainLife.io, OpenNeuro)
  - Source: Project repositories and academic publications

### Tertiary (LOW confidence - flagged for validation)

- **Browser support details** - WebSearch results suggest WebGL2 coverage is broad, but no official browser matrix found
- **Large volume performance** - No published benchmarks for 200MB+ brain MRI files in NiiVue

## Metadata

**Confidence breakdown:**
- Standard stack (NiiVue): **HIGH** - Explicit requirement in DISP-01, official documentation exists
- Architecture patterns: **HIGH** - NiiVue API well-documented; examples available
- Common pitfalls: **MEDIUM** - Based on code review and similar library migrations; some may emerge during implementation
- Open questions: **MEDIUM** - Answered where possible; some require Phase 4 implementation to fully resolve

**Research date:** 2026-01-28
**Valid until:** 2026-02-15 (NiiVue releases ~monthly; Phase 4 implementation should start before then)

**Critical path items:**
1. Confirm NiiVue v0.66.0 supports all requirements (no version-specific gotchas)
2. Test NiiVue with actual brain MRI files from ToothFairy4M dataset
3. Verify WebGL context limits with 4 simultaneous NiiVue instances
4. Measure memory footprint of cached brain MRI volumes
