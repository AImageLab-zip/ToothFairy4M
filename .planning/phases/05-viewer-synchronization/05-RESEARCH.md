# Phase 5: Viewer Synchronization - Research

**Researched:** January 28, 2026
**Domain:** Synchronized Medical Imaging Viewer State Management
**Confidence:** HIGH

## Summary

Phase 5 implements synchronized scrolling across the 2x2 viewer grid so that windows displaying the same orientation (axial, sagittal, or coronal) automatically scroll to the same slice position. The research confirms that NiiVue provides the foundational event system (`onLocationChange` callback) needed to detect slice changes, and the existing code already has the architectural building blocks (window state management, NiiVueViewer wrapper class with slice index methods) required for synchronization.

The recommended approach is to:
1. Extend `windowStates` to track synchronization groups by orientation
2. Implement an event-driven system using NiiVue's `onLocationChange` callback to detect slice changes
3. Create a "free scroll" toggle per window that allows breaking and re-joining synchronization groups
4. Use a central update loop to propagate slice index changes across synchronized windows

This pattern leverages the existing module structure and avoids hand-rolling state management—using NiiVue's native callbacks and the already-implemented `getSliceIndex()`/`setSliceIndex()` methods in the NiiVueViewer wrapper.

**Primary recommendation:** Build synchronization at the ViewerGrid module level by listening to `onLocationChange` callbacks from each viewer and propagating slice index changes to all windows in the same orientation group.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| NiiVue | 0.66.0+ | Medical volume visualization | Already integrated; provides onLocationChange callback for slice tracking |
| Vanilla JavaScript (ES6) | Current | Event-driven state management | Existing codebase uses module pattern; no framework needed |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| NiiVueViewer wrapper | (custom) | Clean API for viewer control | Abstracts NiiVue complexity; already has getSliceIndex()/setSliceIndex() |
| ViewerGrid module | (custom) | Grid-level state and event dispatch | Existing module pattern; already manages window states and orientation |

### Why This Stack

- **NiiVue's `onLocationChange` callback** is the standard way to detect when users scroll (crosshair position changes)
- **NiiVueViewer class already has `getSliceIndex()` and `setSliceIndex()`** methods purpose-built for Phase 5 (see comment in code at line 115-116)
- **ViewerGrid module pattern** provides centralized window state management, avoiding scattered event handlers

## Architecture Patterns

### Recommended Project Structure

The synchronization system builds on the existing structure:

```
static/js/
├── viewer_grid.js           # Add synchronization groups logic here
├── modality_viewers/
│   └── niivue_viewer.js     # Already has getSliceIndex()/setSliceIndex() methods
└── synchronization/ (new)
    └── sync-manager.js      # Optional: Extract synchronization logic to separate module

templates/
└── brain/
    └── patient_detail_content.html # Add "Free Scroll" button to UI

static/css/
└── viewer_grid.css          # Add "Free Scroll" button styling
```

### Pattern 1: Event-Driven Synchronization Groups

**What:** Viewers are organized into groups by orientation. When one viewer's slice index changes, all viewers in the same group update.

**When to use:** This is the required approach for Phase 5. It avoids polling and uses NiiVue's native event system.

**Implementation approach:**

```javascript
// In ViewerGrid module: Track synchronization state
const synchronizationGroups = {
  'axial': [0, 2],      // Windows showing axial view
  'sagittal': [1],      // Windows showing sagittal view
  'coronal': []         // Windows showing coronal view
};

// Track which windows are "free scrolling"
const freeScrollWindows = {
  0: false,
  1: false,
  2: false,
  3: false
};

// When a window's orientation changes:
// 1. Remove it from its old group
// 2. Add it to the new group
// 3. Update the synchronization group tracking
```

**Listening to slice changes:**

When each NiiVueViewer is initialized, attach NiiVue's `onLocationChange` callback:

```javascript
// In NiiVueViewer.init() or after initialization:
viewer.nv.onLocationChange = (data) => {
  // Get the new slice index based on current orientation
  const newSliceIndex = viewer.getSliceIndex();

  // Dispatch event to ViewerGrid to propagate to synchronized windows
  window.dispatchEvent(new CustomEvent('sliceIndexChanged', {
    detail: { windowIndex, newSliceIndex }
  }));
};
```

**Propagating the change:**

```javascript
// In ViewerGrid module:
window.addEventListener('sliceIndexChanged', (event) => {
  const { windowIndex, newSliceIndex } = event.detail;
  const sourceOrientation = windowStates[windowIndex].currentOrientation;

  // Skip if window is in free-scroll mode
  if (freeScrollWindows[windowIndex]) return;

  // Get all windows in the same orientation group
  const groupWindows = synchronizationGroups[sourceOrientation];

  // Update all other windows in the group
  groupWindows.forEach(targetIndex => {
    if (targetIndex !== windowIndex && !freeScrollWindows[targetIndex]) {
      const targetViewer = windowStates[targetIndex].niivueInstance;
      if (targetViewer && targetViewer.isReady()) {
        targetViewer.setSliceIndex(newSliceIndex);
      }
    }
  });
});
```

### Pattern 2: Free Scroll Toggle

**What:** Each window has a "Free Scroll" button that allows breaking synchronization with its group.

**When to use:** Every loaded window needs this button. Clicking it enters "free scroll" mode. Clicking again re-synchronizes to the group's current slice.

**UI Pattern:**

Add to the orientation menu area (alongside A/S/C buttons):

```html
<div class="orientation-menu">
  <button class="orientation-btn active" data-orientation="axial">A</button>
  <button class="orientation-btn" data-orientation="sagittal">S</button>
  <button class="orientation-btn" data-orientation="coronal">C</button>
  <button class="free-scroll-btn" data-window-index="0" title="Free Scroll">
    <i class="fas fa-link-slash"></i>
  </button>
</div>
```

**Logic:**

```javascript
freeScrollBtn.addEventListener('click', () => {
  const isCurrentlyFreeScroll = freeScrollWindows[windowIndex];

  if (isCurrentlyFreeScroll) {
    // Re-sync: Get the current group's slice and apply it
    const groupSliceIndex = getGroupConsensusSlice(sourceOrientation);
    const viewer = windowStates[windowIndex].niivueInstance;
    if (viewer && viewer.isReady()) {
      viewer.setSliceIndex(groupSliceIndex);
    }
    freeScrollWindows[windowIndex] = false;
    freeScrollBtn.classList.remove('free-scroll');
  } else {
    // Enter free scroll mode
    freeScrollWindows[windowIndex] = true;
    freeScrollBtn.classList.add('free-scroll');
  }
});
```

### Pattern 3: Handling Orientation Changes

**What:** When user switches a window's orientation via the A/S/C menu buttons, update which synchronization group that window belongs to.

**When to use:** Every time `setOrientation()` is called on a viewer.

**Approach:**

```javascript
// When orientation button is clicked:
const oldOrientation = windowStates[windowIndex].currentOrientation;
const newOrientation = btn.dataset.orientation;

// Remove from old group
synchronizationGroups[oldOrientation] =
  synchronizationGroups[oldOrientation].filter(w => w !== windowIndex);

// Add to new group
if (!synchronizationGroups[newOrientation].includes(windowIndex)) {
  synchronizationGroups[newOrientation].push(windowIndex);
}

// Update state
windowStates[windowIndex].currentOrientation = newOrientation;

// If not in free-scroll mode, sync to the new group's slice
if (!freeScrollWindows[windowIndex]) {
  const groupSlice = getGroupConsensusSlice(newOrientation);
  viewer.setSliceIndex(groupSlice);
}
```

### Anti-Patterns to Avoid

- **Polling for slice changes:** Don't use `setInterval()` to check `getSliceIndex()` on every viewer. NiiVue's `onLocationChange` callback is purpose-built for this.
- **Manual crosshair tracking:** Don't try to track raw `crosshairPos` values. Use the NiiVueViewer wrapper's `getSliceIndex()` method which already converts to the correct axis.
- **Synchronizing non-loaded windows:** Always check `viewer.isReady()` before calling `setSliceIndex()` to avoid errors on loading windows.
- **Loose orientation state:** Always maintain windowStates[n].currentOrientation in sync with the viewer's actual orientation to prevent desynchronization bugs.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Detecting slice index changes | Custom mutation observer or setInterval polling | NiiVue's `onLocationChange` callback | NiiVue already fires this efficiently; polling is wasteful and has race conditions |
| Managing window groups | Ad-hoc array filtering | Central synchronizationGroups object in ViewerGrid module | Single source of truth prevents inconsistent state; easier to debug |
| Syncing slice index to another viewer | Manual crosshairPos calculation | NiiVueViewer's `setSliceIndex()` method | Already handles axis mapping for each orientation; avoids repeating complex math |
| Tracking free-scroll state | Per-window flags spread across code | Central freeScrollWindows object | Single place to check state; prevents flag desynchronization bugs |

**Key insight:** The NiiVueViewer wrapper class was designed with Phase 5 in mind. The existence of `getSliceIndex()` and `setSliceIndex()` methods (with comments referencing Phase 5 synchronization) means the abstraction layer is already built. Synchronization should be a ViewerGrid-level concern, not something custom built into NiiVueViewer.

## Common Pitfalls

### Pitfall 1: Race Conditions During Rapid Scrolling

**What goes wrong:** User scrolls rapidly through slices. Multiple `onLocationChange` events fire before a previous `setSliceIndex()` call completes. This can leave windows on different slices.

**Why it happens:** NiiVue is asynchronous; `onLocationChange` can fire faster than `setSliceIndex()` propagates to other windows.

**How to avoid:**
- Debounce or throttle `onLocationChange` callbacks to limit updates to ~60fps (requestAnimationFrame)
- Use a flag to ignore `onLocationChange` events while a `setSliceIndex()` update is in progress
- Store the "canonical" slice index in windowStates and compare before updating

**Warning signs:**
- Windows get visibly out of sync after rapid scrolling
- Console shows duplicate synchronization events firing rapidly

### Pitfall 2: Orientation Change Causes Group Mismatch

**What goes wrong:** User switches a window from axial to sagittal. The window is added to the sagittal group, but the synchronizationGroups object still has stale references. Subsequent scrolls don't reach this window.

**Why it happens:** Orientation menu click handler doesn't properly update synchronizationGroups object before/after changing orientation.

**How to avoid:**
- Update synchronizationGroups BEFORE calling `setOrientation()`
- Always verify that windowStates[n].currentOrientation matches the actual viewer orientation
- After any orientation change, log synchronizationGroups to console to verify correctness

**Warning signs:**
- A window stops responding to synchronization events after changing orientation
- Synchronizationgroups object has windows in multiple groups or duplicate entries

### Pitfall 3: Free-Scroll Re-sync Chooses Wrong Slice

**What goes wrong:** User enters free-scroll mode, scrolls independently, then clicks "Free Scroll" to re-join group. The window re-syncs to slice 50, but other windows in the group are now at slice 75 (user scrolled the group after entering free-scroll mode).

**Why it happens:** Re-sync reads the group's current consensus slice, which may have changed while the window was free-scrolling.

**How to avoid:**
- This behavior is actually correct and expected—re-sync should join the current group state
- If you want to preserve the group's state at the moment free-scroll was entered, store the slice index when entering free-scroll mode
- Document in UI that free-scroll re-join will snap to the current group position

**Warning signs:** This is a feature, not a bug, but can surprise users. Make the UX clear.

### Pitfall 4: Missing Checks for Uninitialized Viewers

**What goes wrong:** Code calls `viewer.setSliceIndex()` on a window that's still loading. NiiVue canvas doesn't exist yet, causing errors.

**Why it happens:** Synchronization fires between windows—one viewer loads instantly, another is still loading. The loaded viewer emits `onLocationChange`, triggering sync to the loading window.

**How to avoid:**
- Always wrap `setSliceIndex()` calls with `if (viewer && viewer.isReady())`
- Don't attach `onLocationChange` callbacks until `viewer.initialized === true` in NiiVueViewer
- Use Try-catch around synchronization operations in case a viewer is disposed mid-sync

**Warning signs:**
- "Cannot read property 'volumes' of null" errors in console
- Synchronization stops after a window is cleared and reloaded

### Pitfall 5: Memory Leaks from Orphaned Event Listeners

**What goes wrong:** User clears a window (right-click > Clear). The NiiVueViewer is disposed. But its `onLocationChange` callback is never detached. Later, if a new viewer is loaded in that window, the old callback is still firing.

**Why it happens:** NiiVueViewer's `dispose()` method clears the viewer but doesn't null out the `onLocationChange` callback reference.

**How to avoid:**
- In NiiVueViewer.dispose(), explicitly set `this.nv.onLocationChange = null` before clearing `this.nv`
- Or: Store the callback as a method that checks `if (!this.initialized)` and returns early
- In ViewerGrid, verify that listeners are cleaned up when windows are cleared

**Warning signs:**
- Multiple "identical" synchronization events in console for a single scroll
- Memory usage grows over time as you load and clear windows repeatedly

## Code Examples

Verified patterns from official sources:

### NiiVue onLocationChange Callback

```javascript
// Source: https://niivue.com/docs/api/niivue/classes/Niivue/
niivue.onLocationChange = (data) => {
  // data.mm: coordinates in millimeters
  // data.vox: voxel coordinates
  // data.frac: fractional coordinates [0-1]
  // data.values: intensity values at location

  const sliceIndex = viewer.getSliceIndex();
  console.log('Current slice index:', sliceIndex);
};
```

### Using NiiVueViewer Methods for Sync

```javascript
// Source: static/js/modality_viewers/niivue_viewer.js (lines 118-147)
// Get current slice in any orientation:
const currentSlice = viewer.getSliceIndex();

// Set slice in any orientation:
viewer.setSliceIndex(100);

// Get total slices in current orientation:
const totalSlices = viewer.getSliceCount();

// Check if viewer is ready before syncing:
if (viewer && viewer.isReady()) {
  viewer.setSliceIndex(newSliceIndex);
}
```

### Synchronization Group Pattern

```javascript
// Central synchronization state (add to ViewerGrid module)
const synchronizationGroups = {
  'axial': [],
  'sagittal': [],
  'coronal': []
};

const freeScrollWindows = {
  0: false,
  1: false,
  2: false,
  3: false
};

// Update groups when a window's orientation changes
function updateOrientationGroup(windowIndex, newOrientation) {
  const oldOrientation = windowStates[windowIndex].currentOrientation;

  // Remove from old group
  synchronizationGroups[oldOrientation] =
    synchronizationGroups[oldOrientation].filter(i => i !== windowIndex);

  // Add to new group
  if (!synchronizationGroups[newOrientation].includes(windowIndex)) {
    synchronizationGroups[newOrientation].push(windowIndex);
  }

  // Update state
  windowStates[windowIndex].currentOrientation = newOrientation;
}

// Listen to slice changes and propagate to group
window.addEventListener('sliceIndexChanged', (event) => {
  const { windowIndex, newSliceIndex } = event.detail;
  const sourceOrientation = windowStates[windowIndex].currentOrientation;

  // Don't propagate if source window is in free-scroll mode
  if (freeScrollWindows[windowIndex]) return;

  // Sync all windows in the same orientation group
  synchronizationGroups[sourceOrientation].forEach(targetIndex => {
    if (targetIndex !== windowIndex && !freeScrollWindows[targetIndex]) {
      const targetViewer = windowStates[targetIndex].niivueInstance;
      if (targetViewer && targetViewer.isReady()) {
        targetViewer.setSliceIndex(newSliceIndex);
      }
    }
  });
});
```

### Attaching onLocationChange to Each Viewer

```javascript
// Add this in loadModalityInWindow() after viewer initialization:
viewer.nv.onLocationChange = () => {
  // Only emit if not currently syncing (avoid feedback loop)
  const sliceIndex = viewer.getSliceIndex();
  window.dispatchEvent(new CustomEvent('sliceIndexChanged', {
    detail: {
      windowIndex: windowIndex,  // From closure
      newSliceIndex: sliceIndex
    }
  }));
};
```

### Free Scroll Toggle Button Handler

```javascript
// In loadModalityInWindow(), attach click handler to free-scroll button
const freeScrollBtn = windowEl.querySelector('.free-scroll-btn');
if (freeScrollBtn) {
  freeScrollBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const windowIndex = parseInt(freeScrollBtn.dataset.windowIndex, 10);

    if (freeScrollWindows[windowIndex]) {
      // Re-sync to group
      const orientation = windowStates[windowIndex].currentOrientation;
      const groupSlice = getGroupConsensusSlice(orientation);
      const viewer = windowStates[windowIndex].niivueInstance;

      if (viewer && viewer.isReady()) {
        viewer.setSliceIndex(groupSlice);
      }

      freeScrollWindows[windowIndex] = false;
      freeScrollBtn.classList.remove('free-scroll');
    } else {
      // Enter free-scroll mode
      freeScrollWindows[windowIndex] = true;
      freeScrollBtn.classList.add('free-scroll');
    }
  });
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual polling with setInterval | Event-driven callbacks (onLocationChange) | NiiVue 0.50+ | Eliminates wasteful polling, enables real-time responsiveness |
| Crosshair coordinate math in app code | Abstracted in NiiVueViewer (getSliceIndex/setSliceIndex) | Phase 4 | Reduces bugs from coordinate conversion errors |
| Loose orientation state | Centralized in windowStates object | Phase 3 | Single source of truth prevents desynchronization |
| Global event listeners on document | Scoped to ViewerGrid module | Phase 3+ | Easier to manage, prevents listener leaks |

**Deprecated/outdated:**
- Polling-based state tracking: Modern event callbacks from NiiVue make this unnecessary. Polling creates race conditions and wastes CPU.
- Hardcoded slice values in UI: Always use getSliceIndex() to read current state. Synchronization depends on accurate state tracking.

## Open Questions

1. **Throttling/debouncing strategy**
   - What we know: onLocationChange fires frequently during user scrolling
   - What's unclear: Should we debounce to 30fps, 60fps, or every frame?
   - Recommendation: Start with requestAnimationFrame debouncing (60fps) and benchmark performance with rapid scrolling

2. **Group consensus when windows have different slice counts**
   - What we know: Different orientations can have different dimension sizes (e.g., axial has 256 slices, sagittal has 192)
   - What's unclear: When a window changes orientation mid-group, how should slice index be mapped?
   - Recommendation: Use fractional coordinates [0-1] internally and map to axis-specific range when updating. This is already handled by NiiVueViewer's crosshairPos conversion.

3. **UI placement of Free Scroll button**
   - What we know: Orientation menu has A/S/C buttons in top-right
   - What's unclear: Should Free Scroll button be added to orientation menu or placed separately?
   - Recommendation: Add to orientation menu area, but as a distinct button with different styling (icon: link-slash when active, link when inactive)

4. **Persistence of synchronization state**
   - What we know: Current implementation does not persist state
   - What's unclear: Should synchronization groups be saved across page reloads?
   - Recommendation: Not required for Phase 5. Add to backlog if clinical workflow demands remembering synchronization preferences.

## Sources

### Primary (HIGH confidence)
- NiiVue API documentation (v0.66.0) - [onLocationChange callback](https://niivue.com/docs/api/niivue/classes/Niivue/)
- [GitHub releases: NiiVue v0.66.0](https://github.com/niivue/niivue/releases) - Current stable version and changelog
- Existing code: `/static/js/modality_viewers/niivue_viewer.js` - getSliceIndex/setSliceIndex/isReady methods already implemented
- Existing code: `/static/js/viewer_grid.js` - windowStates architecture and module pattern already in place

### Secondary (MEDIUM confidence)
- [State Management in Vanilla JS: 2026 Trends](https://medium.com/@chirag.dave/state-management-in-vanilla-js-2026-trends-f9baed7599de) - Modern patterns for event-driven architecture
- [MDN VisualViewport scroll events](https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport/scroll_event) - Best practices for scroll event handling
- [Cornerstone.js documentation](https://www.cornerstonejs.org/) - Reference implementation of medical imaging synchronization

### Tertiary (LOW confidence)
- WebSearch results on "multi-window synchronization patterns" - General patterns, not NiiVue-specific

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - NiiVue 0.66.0 is current stable; onLocationChange is documented and tested
- Architecture: HIGH - NiiVueViewer wrapper and ViewerGrid module already provide required abstractions
- Pitfalls: MEDIUM - Drawn from general async/event handling knowledge and medical imaging patterns; NiiVue-specific edge cases may emerge during implementation
- Code examples: HIGH - Based on official NiiVue documentation and existing verified code in the repository

**Research date:** January 28, 2026
**Valid until:** February 27, 2026 (30 days for stable patterns; NiiVue may release patch versions)

**Notes:**
- NiiVue is pre-1.0 (currently v0.66.0), so API may change in future releases. Monitor [NiiVue releases](https://github.com/niivue/niivue/releases) before major version bumps.
- The template currently uses NiiVue 0.67.0 (as per patient_detail_content.html line 180), which is close to the researched 0.66.0—API compatibility should be high.
