---
task: 002
type: quick
autonomous: true
files_modified:
  - static/js/viewer_grid.js
context_budget: ~30%
---

<objective>
Re-enable NiiVue's intensity adjustment (window/level) feature using Alt+left click+drag instead of right-click+drag.

Purpose: Restore medical imaging intensity adjustment workflow that was blocked when custom context menu was added in quick task 001. Alt+left click+drag provides an alternative trigger that doesn't conflict with the context menu.

Output: Working Alt+left click intensity adjustment for all viewer windows.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@static/js/viewer_grid.js
@.planning/quick/001-fix-viewer-pan-limits-zoom-context-menu/001-SUMMARY.md

## Key Context from Quick Task 001

In quick task 001, the right-click context menu was added with capture-phase event handling:

```javascript
canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopImmediatePropagation();
    showViewerContextMenu(e.clientX, e.clientY, windowIndex, viewer);
}, { capture: true });
```

This prevented NiiVue's default right-click behavior (drawing intensity adjustment rectangle).

## What NiiVue's Intensity Adjustment Does

- User drags to draw a rectangle on the image
- Horizontal movement adjusts window width (contrast)
- Vertical movement adjusts window center (brightness)
- Standard medical imaging window/level control
- NiiVue has built-in support for this via `opts.dragMode`

## NiiVue v0.67.0 Drag Modes

NiiVue supports different drag behaviors via the `dragMode` property:
- `Niivue.DRAG_MODE.pan` - Pan the image
- `Niivue.DRAG_MODE.contrast` - Window/level adjustment (intensity square)
- `Niivue.DRAG_MODE.measurement` - Draw measurements
- `Niivue.DRAG_MODE.none` - No drag behavior

The `dragMode` can be changed dynamically at runtime.

## Current Viewer Configuration

Each window has:
- `viewer.nv` - The NiiVue instance
- Canvas event listeners in capture phase for Ctrl+scroll (zoom), Shift+scroll (fast nav), Ctrl+drag (pan)
- Right-click blocked for custom context menu
</context>

<tasks>

<task type="auto">
  <name>Add Alt+left click intensity adjustment</name>
  <files>static/js/viewer_grid.js</files>
  <action>
Add Alt+left click+drag event handlers to trigger NiiVue's intensity adjustment behavior.

**Implementation approach:**

1. Add mousedown listener on canvas in capture phase after existing Ctrl+drag handler (around line 593)
2. Detect Alt+left click (e.altKey && e.button === 0)
3. When Alt+left click detected:
   - Set `viewer.nv.opts.dragMode = window.niivue.DRAG_MODE.contrast`
   - Let NiiVue's default handlers process the drag (do NOT preventDefault)
   - Add visual feedback: Change cursor to crosshair
4. Add mouseup listener to reset:
   - Set `viewer.nv.opts.dragMode = window.niivue.DRAG_MODE.none` (restore default)
   - Reset cursor

**Key details:**
- Use capture phase for consistency with other custom handlers
- DO NOT call preventDefault() or stopPropagation() - let NiiVue's handlers run
- NiiVue's contrast drag mode handles horizontal (window width) and vertical (window center) movements
- Reset dragMode on mouseup to prevent accidental intensity adjustments from normal clicks
- Access DRAG_MODE constants via `window.niivue.DRAG_MODE` (NiiVue is available as global UMD export)

**Code location:**
Insert after the existing Ctrl+drag pan handlers (after line 630, before canvas.addEventListener('mouseup', stopPan))

**Pattern to follow:**
```javascript
// Alt+left click: intensity adjustment (window/level)
let isAdjustingIntensity = false;

canvas.addEventListener('mousedown', (e) => {
    if (e.altKey && e.button === 0) {
        isAdjustingIntensity = true;
        viewer.nv.opts.dragMode = window.niivue.DRAG_MODE.contrast;
        canvas.style.cursor = 'crosshair';
        // Do NOT preventDefault - let NiiVue handle the drag
    }
}, { capture: true });

const stopIntensityAdjust = () => {
    if (isAdjustingIntensity) {
        isAdjustingIntensity = false;
        viewer.nv.opts.dragMode = window.niivue.DRAG_MODE.none;
        canvas.style.cursor = '';
    }
};
canvas.addEventListener('mouseup', stopIntensityAdjust);
canvas.addEventListener('mouseleave', stopIntensityAdjust);
```

**Why NOT preventDefault:**
NiiVue's intensity adjustment requires its own mousedown/mousemove/mouseup handlers to run. By setting dragMode to contrast and NOT preventing default, we let NiiVue's handlers execute the intensity adjustment logic.

**Testing hooks:**
- Alt+left click+drag should draw rectangle and adjust brightness/contrast
- Normal left clicks should still work for NiiVue's default slice navigation
- Ctrl+drag should still pan (no conflict)
- Right-click should still show context menu (no conflict)
  </action>
  <verify>
Manual testing in browser:
1. Load a modality in any viewer window
2. Hold Alt + left click + drag on the image
3. Verify: Rectangle appears during drag
4. Verify: Horizontal drag adjusts contrast (window width)
5. Verify: Vertical drag adjusts brightness (window center)
6. Verify: Normal left clicks still navigate slices
7. Verify: Ctrl+drag still pans the image
8. Verify: Right-click still shows context menu

Check browser console for no JavaScript errors.
  </verify>
  <done>
Alt+left click+drag on any viewer window draws intensity adjustment rectangle and dynamically adjusts window width (horizontal) and window center (vertical) using NiiVue's built-in contrast drag mode.
  </done>
</task>

</tasks>

<verification>
Load a brain scan in viewer window, use Alt+left click+drag to adjust intensity, verify contrast/brightness changes in real-time. Test that other interactions (normal click, Ctrl+drag pan, right-click menu, Ctrl+scroll zoom, Shift+scroll navigation) all still work correctly.
</verification>

<success_criteria>
- [ ] Alt+left click+drag triggers NiiVue's intensity adjustment
- [ ] Horizontal drag adjusts window width (contrast)
- [ ] Vertical drag adjusts window center (brightness)
- [ ] Rectangle visualization appears during drag
- [ ] No conflicts with existing interactions (pan, zoom, scroll, context menu)
- [ ] Cursor changes to crosshair during Alt+left click
- [ ] dragMode resets to none after mouseup/mouseleave
- [ ] Code committed to git with appropriate message
</success_criteria>

<output>
After completion, create `.planning/quick/002-add-alt-click-intensity-square/002-SUMMARY.md` with:
- Overview of implementation
- Technical details of dragMode switching
- Testing results
- Commit hash
</output>
