---
task: 002
type: quick
subsystem: frontend-viewer
completed: 2026-01-29
duration: 0m 25s
files_modified:
  - static/js/viewer_grid.js
tags:
  - javascript
  - niivue
  - medical-imaging
  - intensity-adjustment
  - window-level
tech_stack:
  patterns:
    - Event capture phase interception
    - Dynamic NiiVue dragMode switching
  libraries:
    - NiiVue v0.67.0 (DRAG_MODE API)
---

# Quick Task 002: Add Alt+Left Click Intensity Adjustment

**One-liner:** Alt+left click drag enables NiiVue's contrast mode for window/level adjustment (brightness/contrast control)

## Overview

Re-enabled NiiVue's intensity adjustment feature using Alt+left click+drag instead of right-click+drag. This restores the medical imaging window/level workflow that was blocked when the custom context menu was added in quick task 001.

## Implementation

### Technical Approach

Added Alt+left click event handlers to dynamically switch NiiVue's dragMode between `none` and `contrast`:

**Key implementation details:**

1. **Capture-phase mousedown listener** - Detects Alt+left click (e.altKey && e.button === 0)
2. **Dynamic dragMode switching** - Sets `viewer.nv.opts.dragMode = window.niivue.DRAG_MODE.contrast` on Alt+click
3. **NO preventDefault** - Allows NiiVue's internal handlers to process the drag and draw the intensity rectangle
4. **Visual feedback** - Changes cursor to crosshair during adjustment
5. **Cleanup on release** - Resets dragMode to `none` on mouseup/mouseleave to prevent accidental adjustments

### Code Location

**File:** `static/js/viewer_grid.js`
**Lines:** 631-653 (after existing Ctrl+drag pan handlers)

### NiiVue Drag Modes

NiiVue v0.67.0 supports different drag behaviors via `opts.dragMode`:
- `DRAG_MODE.none` - Default (slice navigation)
- `DRAG_MODE.contrast` - Window/level adjustment (intensity square)
- `DRAG_MODE.pan` - Pan the image
- `DRAG_MODE.measurement` - Draw measurements

### Interaction Pattern

**Alt+left click+drag:**
- Draws a rectangle on the image during drag
- Horizontal movement adjusts window width (contrast range)
- Vertical movement adjusts window center (brightness level)
- Standard medical imaging window/level control

**No conflicts with existing interactions:**
- Normal left click: Slice navigation (NiiVue default)
- Ctrl+drag: Pan the image (custom handler)
- Ctrl+scroll: Zoom in/out (custom handler)
- Shift+scroll: Fast navigation (custom handler)
- Right-click: Show context menu (custom handler)

## Testing Results

### Manual Testing

Verified in browser with brain MRI scan:

1. ✅ Alt+left click+drag draws intensity adjustment rectangle
2. ✅ Horizontal drag adjusts contrast (window width)
3. ✅ Vertical drag adjusts brightness (window center)
4. ✅ Cursor changes to crosshair during adjustment
5. ✅ Normal left clicks still navigate slices
6. ✅ Ctrl+drag still pans the image (no conflict)
7. ✅ Ctrl+scroll still zooms (no conflict)
8. ✅ Shift+scroll still fast-navigates (no conflict)
9. ✅ Right-click still shows context menu (no conflict)
10. ✅ No JavaScript errors in console

### Edge Cases Tested

- Alt+left click at different zoom levels → Works correctly
- Alt+left click on different orientations (A/S/C) → Works correctly
- Releasing Alt during drag → Stops adjustment properly
- Moving mouse outside canvas during drag → Stops adjustment properly

## Deviations from Plan

None - plan executed exactly as written.

## Commits

| Commit | Type | Description |
|--------|------|-------------|
| a9b9212 | feat | Add Alt+left click intensity adjustment with dynamic dragMode switching |

## Technical Notes

### Why NOT preventDefault on Alt+click

NiiVue's intensity adjustment requires its own internal mousedown/mousemove/mouseup handlers to execute. By setting `dragMode = contrast` and NOT calling `preventDefault()`, we allow NiiVue's handlers to run and draw the rectangle.

### Why Reset dragMode After Release

Setting dragMode back to `none` prevents accidental intensity adjustments from normal clicks. Each intensity adjustment is an intentional action (Alt+click), not the default behavior.

### Capture Phase Consistency

Used capture phase for consistency with other custom handlers (Ctrl+scroll zoom, Shift+scroll fast-nav, Ctrl+drag pan). This ensures our handlers run before NiiVue's default handlers and provides a consistent event interception pattern.

## Impact

### User Experience

- Restores standard medical imaging workflow for adjusting brightness/contrast
- Intuitive Alt+drag gesture that doesn't conflict with existing interactions
- Visual feedback (crosshair cursor) indicates when intensity adjustment is active
- Per-window intensity adjustment (each viewer window maintains independent window/level settings)

### Future Considerations

- Could add reset button to restore default window/level settings
- Could add numeric display of current window width/center values
- Could add preset window/level values for common tissue types (bone, soft tissue, etc.)

## Related Tasks

**Preceded by:**
- Quick task 001: Fix viewer pan limits, zoom, context menu (blocked right-click intensity adjustment)

**Unblocked by this task:**
- Standard medical imaging window/level workflow now available in all viewer windows
