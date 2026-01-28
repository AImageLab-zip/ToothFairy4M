# Phase 3: Viewer Grid - Research

**Researched:** 2026-01-28
**Domain:** Brain MRI viewer grid UI, drag-drop interaction, modality loading
**Confidence:** HIGH

## Summary

The ToothFairy4M project already has a working brain patient detail page with modality toggling and CBCT viewer infrastructure. Phase 3 extends this by replacing single-modality viewing with a 2x2 grid allowing simultaneous multi-modality display via drag-drop.

**Key findings:**

1. **Current architecture** uses radio buttons for modality selection (mutually exclusive) - the grid needs to support simultaneous display
2. **Backend modality system** is well-established: Modality model with slug/label, patient.modalities M2M relationship, and FileRegistry for file tracking
3. **File serving** is secured via API endpoint at `/api/processing/files/serve/{file_id}/` with authentication checks
4. **Frontend patterns** use Bootstrap 5.3 CSS framework, vanilla JavaScript with event listeners, and three.js for 3D rendering
5. **Existing viewers** (CBCT, iOS) use JavaScript modules (window.CBCTViewer, window.IOSViewer) that handle rendering

**Primary recommendation:** Build grid as a new component separate from existing toggle system. Each window maintains independent modality state. Modality chips are draggable items from top bar. Leverage existing FileRegistry API for loading modality files.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Bootstrap | 5.3.0 | Grid layout, styling, buttons | Already in project, used throughout |
| Three.js | r128 | 3D viewer rendering | Already in use for IOS/CBCT viewers |
| Vanilla JavaScript | ES6+ | Event handling, drag-drop | Project standard, no build step needed |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Font Awesome | 6.0.0 | Icons for UI controls | Already available via CDN |
| Django REST (implicit) | N/A | File serving API | Already implemented for file access |

### No External Libraries Needed
- No third-party drag-drop libraries (native HTML5 API sufficient)
- No grid-layout library (Bootstrap grid columns work fine)
- No spinner library (Font Awesome spinner icons available)

**Installation:**
All dependencies already present in project. No new npm packages required.

## Architecture Patterns

### Recommended Project Structure

```
templates/
├── brain/
│   └── patient_detail_content.html       # Inject grid component
static/
├── css/
│   └── viewer_grid.css                   # New: grid window styling
├── js/
│   └── viewer_grid.js                    # New: grid controller
└── existing viewers remain unchanged
```

### Pattern 1: Modality Grid Component Structure

**What:** A 2x2 grid of independent viewer windows, each can load one modality. Top bar shows patient info and draggable modality chips.

**When to use:** When displaying brain MRI data requiring simultaneous multi-modality comparison.

**Architecture:**

```
ViewerGrid (controller)
├── windowStates: { [0-3]: { modality: 'T1', loading: false, error: null } }
├── ModalityList (draggable chips)
├── Grid of 4 Windows
│   ├── Window 0
│   ├── Window 1
│   ├── Window 2
│   └── Window 3
└── Event handlers
    ├── dragstart on chip
    ├── dragover on window
    ├── drop on window
    └── context menu (right-click)
```

**Data flow:**

1. User drags modality chip (e.g., "T1") from top bar
2. dragover event triggers visual hint overlay on target window
3. drop event captures modality slug and window index
4. Load handler fetches file URL from backend via FileRegistry API
5. Appropriate viewer (CBCT, IOS, or generic) initializes with file
6. Window state updates: { modality: 'T1', loading: false, error: null }

### Pattern 2: Individual Window Lifecycle

**States:**
- Empty: no modality, shows dashed border with "Drop modality here"
- Loading: spinner centered, semi-transparent overlay
- Loaded: displays slice/volume, modality code in corner, context menu available
- Error: red error text with retry button

**Viewer instantiation:**
- T1/T2/FLAIR/T1c modalities → use CBCT viewer (NIfTI volume slices)
- Each window gets unique container ID for Three.js rendering
- Window state tracks loading/error for UI updates

**Right-click context menu:**
- Single option: "Clear" → unload modality, return to empty state

### Pattern 3: Draggable Modality Chips

**UI:**
- Pills/chips in top bar showing all 4 modalities (T1, T2, FLAIR, T1c)
- Unavailable modalities greyed out (opacity, color)
- Visual indicator (checkmark/badge) showing which window contains each modality
- Draggable via native HTML5 drag API

**Implementation:**
```javascript
chip.draggable = true;
chip.addEventListener('dragstart', (e) => {
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('modality-slug', 'T1');
});
```

### Pattern 4: Drag-Drop Zone Hints

**Visual feedback:**
- dragover event → semi-transparent overlay appears with "Drop here" text
- Non-matching drops ignored (only allow modality drops)
- Overlay positioned absolutely over window, z-index above content
- Smooth transition (0.2s ease)

**Prevention:**
- Prevent default dragover behavior to allow drop
- Check dataTransfer types to ensure modality is being dragged

### Anti-Patterns to Avoid

- **Single global modality state:** Each window must have independent modality state, not mutually exclusive
- **Modal confirmation for replace:** Context says "replace immediately" - no confirmation dialogs
- **Blocking viewer initialization:** Don't block UI while file loads - use spinner + async loading
- **Duplicating Three.js viewer code:** Reuse existing CBCTViewer and IOSViewer modules, don't rebuild
- **Hardcoding file URLs:** Always fetch from FileRegistry API via `/api/processing/files/serve/{file_id}/`

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CBCT volume rendering | Custom volume renderer | window.CBCTViewer from modality_viewers/cbct.js | Already handles shader management, slice rendering, panoramic views |
| File serving & auth | Custom file endpoints | `/api/processing/files/serve/{file_id}/` | Validates paths, checks permissions, prevents directory traversal |
| Modality selection | Rewrite toggle system | Extend current chip architecture | Modality system already proven in patient detail |
| Three.js scene setup | New scene per window | Reuse CBCTViewer.init pattern | Project pattern for responsive scene sizing |
| Draggable UI | Custom drag system | HTML5 Drag and Drop API | Native, no dependencies, full browser support |

**Key insight:** The codebase already solves the hard problems (file serving, viewer rendering, modality system). Phase 3 is primarily UI layout + wiring existing components, not solving new technical problems.

## Common Pitfalls

### Pitfall 1: Confusing Existing Modality Toggle with Grid Windows

**What goes wrong:** Trying to repurpose the existing radio-button toggle system for grid windows instead of building parallel structure.

**Why it happens:** The toggle system looks like modality selection, but it's mutually exclusive (one modality at a time). Grid needs simultaneous display.

**How to avoid:** Keep radio toggles for single-viewer fallback mode. Build grid as separate component with independent window state objects. Both can coexist (grid is primary for brain project).

**Warning signs:** Code that tries to sync grid state with radio button state will break when window states diverge.

### Pitfall 2: Initializing All Four Viewers Upfront

**What goes wrong:** Creating Four Three.js scenes/cameras/renderers on page load leads to memory bloat and GPU starvation.

**Why it happens:** Easier to initialize all than lazy-load, but each viewer is expensive (WebGL context, GPU memory).

**How to avoid:** Initialize viewer only when modality is dropped into window. Dispose viewer when window is cleared. Track initialized viewers per window to prevent re-initialization.

**Warning signs:** Page load is slow, browser uses excessive memory, "too many WebGL contexts" errors.

### Pitfall 3: Mixing FileRegistry IDs with File Paths

**What goes wrong:** Template passes file_path directly to frontend; frontend tries to use as URL without going through API.

**Why it happens:** FileRegistry.file_path is a server-side filesystem path (e.g., `/dataset/scans/patient_123/cbct.nii`), not a URL.

**How to avoid:** Always use FileRegistry.id to fetch files via `/api/processing/files/serve/{file_id}/`. Template should pass file_id, not file_path.

**Warning signs:** Requests 404 on arbitrary paths, security warnings in browser console.

### Pitfall 4: Not Tracking Window State Separately from UI Elements

**What goes wrong:** Trying to reconstruct modality state from DOM attributes leads to stale state when UI updates fail.

**Why it happens:** DOM is ephemeral, but modality state must persist for right-click menu, window replacement, etc.

**How to avoid:** Maintain explicit windowStates object:
```javascript
windowStates = {
    0: { modality: 'T1', loading: false, error: null, fileId: 42 },
    1: { modality: null, loading: false, error: null, fileId: null },
    // etc
};
```

**Warning signs:** Right-click menu shows wrong modality, clearing window fails mysteriously, duplicate load requests.

### Pitfall 5: Drag-Drop Not Working Across Different Drag Events

**What goes wrong:** dragover handler prevents default but drop handler doesn't fire.

**Why it happens:** Drop only fires if dragover handler calls preventDefault(). Easy to forget in one place.

**How to avoid:** Always preventDefault in dragover. Check exact sequence:
```javascript
element.addEventListener('dragover', (e) => e.preventDefault());
element.addEventListener('drop', (e) => {
    e.preventDefault();
    const modality = e.dataTransfer.getData('modality-slug');
    // handle drop
});
```

**Warning signs:** Drop handler never executes, file uploads work but modality drops don't.

## Code Examples

Verified patterns from existing codebase:

### Example 1: Initialize Viewer from FileRegistry

```javascript
// Source: maxillo/api_views/files.py + existing CBCT viewer pattern
async function loadModalityInWindow(windowIndex, modality) {
    windowStates[windowIndex].loading = true;
    updateWindowUI(windowIndex);

    try {
        // 1. Get FileRegistry ID for modality from patient data
        const fileId = getFileIdForModality(modality); // template context has this

        // 2. Fetch file via secure API endpoint
        const response = await fetch(`/api/processing/files/serve/${fileId}/`);
        const blob = await response.blob();

        // 3. Initialize viewer (CBCT pattern)
        const containerId = `viewer-window-${windowIndex}`;
        window.CBCTViewer.init(modality);

        windowStates[windowIndex] = {
            modality: modality,
            loading: false,
            error: null,
            fileId: fileId
        };
        updateWindowUI(windowIndex);
    } catch (error) {
        windowStates[windowIndex].error = error.message;
        windowStates[windowIndex].loading = false;
        updateWindowUI(windowIndex);
    }
}
```

### Example 2: Drag-Drop Implementation

```javascript
// Source: HTML5 Drag and Drop API (standard)
function initDragDrop() {
    // Make chips draggable
    document.querySelectorAll('[data-modality]').forEach(chip => {
        chip.draggable = true;
        chip.addEventListener('dragstart', (e) => {
            e.dataTransfer.effectAllowed = 'copy';
            e.dataTransfer.setData('modality-slug', chip.dataset.modality);
        });
    });

    // Make windows drop zones
    document.querySelectorAll('.viewer-window').forEach((window, index) => {
        window.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            window.classList.add('drag-over'); // CSS: semi-transparent overlay
        });

        window.addEventListener('dragleave', (e) => {
            window.classList.remove('drag-over');
        });

        window.addEventListener('drop', (e) => {
            e.preventDefault();
            const modality = e.dataTransfer.getData('modality-slug');
            window.classList.remove('drag-over');
            loadModalityInWindow(index, modality);
        });
    });
}
```

### Example 3: Window State Management

```javascript
// State object pattern (not DOM-based)
const windowStates = {
    0: { modality: null, loading: false, error: null, fileId: null },
    1: { modality: null, loading: false, error: null, fileId: null },
    2: { modality: null, loading: false, error: null, fileId: null },
    3: { modality: null, loading: false, error: null, fileId: null }
};

function updateWindowUI(windowIndex) {
    const state = windowStates[windowIndex];
    const windowEl = document.querySelector(`[data-window-index="${windowIndex}"]`);

    if (state.loading) {
        windowEl.innerHTML = `<div class="spinner-border"></div>`;
        windowEl.style.background = 'rgba(255,255,255,0.5)';
    } else if (state.error) {
        windowEl.innerHTML = `<div class="error-text">${state.error}</div>`;
        windowEl.style.background = '#ffcccc';
    } else if (state.modality) {
        // Viewer is initialized, just add label
        const label = document.createElement('div');
        label.className = 'window-label';
        label.textContent = state.modality.toUpperCase();
        windowEl.appendChild(label);
    } else {
        // Empty state
        windowEl.innerHTML = `
            <div class="drop-hint">
                <i class="fas fa-arrow-down"></i>
                <p>Drop modality here</p>
            </div>
        `;
        windowEl.style.borderStyle = 'dashed';
    }
}
```

### Example 4: Context Menu for Window Clear

```javascript
// Source: existing patient_detail.js patterns (toggleDropdown)
function initContextMenus() {
    document.querySelectorAll('.viewer-window').forEach((window, index) => {
        window.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            if (!windowStates[index].modality) return; // No menu if empty

            const menu = document.createElement('div');
            menu.className = 'context-menu';
            menu.style.position = 'fixed';
            menu.style.left = e.clientX + 'px';
            menu.style.top = e.clientY + 'px';
            menu.innerHTML = `<button onclick="clearWindow(${index})">Clear</button>`;
            document.body.appendChild(menu);

            // Close menu on click outside
            document.addEventListener('click', () => menu.remove(), { once: true });
        });
    });
}

function clearWindow(windowIndex) {
    // Dispose viewer if initialized
    if (window.CBCTViewer && window.CBCTViewer.dispose) {
        try { window.CBCTViewer.dispose(); } catch (e) { }
    }

    windowStates[windowIndex] = {
        modality: null,
        loading: false,
        error: null,
        fileId: null
    };
    updateWindowUI(windowIndex);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single modality toggle (radio button) | Grid with simultaneous viewers | Phase 3 | Enables side-by-side comparison of T1/T2/FLAIR/T1c |
| Hardcoded HTML viewer containers | Dynamic window creation | Phase 3 | Allows independent window sizing and layout |
| Manual file URL construction | FileRegistry API endpoint | Phase 2 | Secure file serving with path validation |
| jQuery drag/drop plugins | Native HTML5 API | Phase 3 (new) | No dependencies, better performance |

**Deprecated/outdated:**
- Single-modality radio toggle system will remain for fallback but won't be primary interface for brain viewers
- Old CBCT-only patient detail will be superseded by multi-modality grid

## Open Questions

1. **Resizable windows boundary**
   - What we know: CONTEXT.md specifies "Resizable windows — users can drag borders to resize individual windows"
   - What's unclear: This may be out of scope for Phase 3 (window dropping/loading) vs Phase 4+ (window layout)
   - Recommendation: Phase 3 focuses on loading/display; handle resize in follow-up phase using CSS Grid or similar

2. **Synchronized scrolling**
   - What we know: Deferred in CONTEXT.md as separate phase
   - What's unclear: Whether grid windows should have independent slice positions or sync them
   - Recommendation: Keep slice positions independent in Phase 3; sync as explicit feature in later phase

3. **File URL caching strategy**
   - What we know: FileRegistry.id can fetch files via API
   - What's unclear: Whether to cache file blobs in memory or refetch on window reopen
   - Recommendation: Refetch per session (simpler), optimize caching if performance issue arises

## Sources

### Primary (HIGH confidence)

- **Patient detail view**: `/home/llumetti/ToothFairy4M-dev/maxillo/views/patient_detail.py` (lines 173-224)
  - Modality system, patient.modalities M2M relationship, FileRegistry integration

- **Common models**: `/home/llumetti/ToothFairy4M-dev/common/models.py` (lines 28-54, 401-502)
  - Modality model (slug, label, subtypes), FileRegistry model (file_type, modality FK)

- **File serving API**: `/home/llumetti/ToothFairy4M-dev/maxillo/api_views/files.py` (lines 1-100)
  - Secure file endpoint at `/api/processing/files/serve/{file_id}/`

- **Frontend CSS patterns**: `/home/llumetti/ToothFairy4M-dev/static/css/patient_detail.css` (full file)
  - Bootstrap 5.3 grid, viewer styling, modal patterns

- **Existing CBCT viewer**: `/home/llumetti/ToothFairy4M-dev/static/js/modality_viewers/cbct.js` (lines 1-80)
  - Viewer initialization pattern, container ID usage, Three.js setup

- **Patient detail template**: `/home/llumetti/ToothFairy4M-dev/templates/brain/patient_detail_content.html` (full file)
  - Current layout, modality toggle pattern, viewer container structure

### Secondary (MEDIUM confidence)

- **Volume renderer**: `/home/llumetti/ToothFairy4M-dev/static/js/volume_renderer.js` (lines 1-100)
  - Scene setup pattern, responsive container sizing

- **Patient detail JS**: `/home/llumetti/ToothFairy4M-dev/static/js/patient_detail.js` (lines 224-249)
  - Modality switching pattern, viewer disposal/initialization

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** - All technologies verified in project codebase
- Architecture: **HIGH** - Patterns based on existing viewer implementation (CBCT, iOS)
- File serving: **HIGH** - FileRegistry API fully documented and tested
- Drag-drop: **HIGH** - Native HTML5 API, standardized across browsers
- Pitfalls: **MEDIUM** - Identified based on code review; some may emerge during implementation

**Research date:** 2026-01-28
**Valid until:** 2026-02-28 (stable domain, low churn rate)

**Key uncertainties:**
- Window resizing implementation (may require separate phase)
- Exact UX for drag-over overlay (CSS discretion per CONTEXT)
- Viewer initialization timing for large NIfTI files (performance optimization)
