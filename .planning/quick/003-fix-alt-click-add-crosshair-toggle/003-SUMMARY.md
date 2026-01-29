---
task: 003
type: quick
completed: 2026-01-29
commits:
  - f3cbd57
files_modified:
  - static/js/viewer_grid.js
  - static/css/viewer_grid.css
---

# Quick Task 003: Fix Alt+Right-Click Intensity & Add Crosshair Toggle

## What Was Fixed

### 1. Right-Click Intensity Square Bug
**Problem:** Regular right-click triggered both the custom context menu AND NiiVue's intensity adjustment square. The `contextmenu` event fires AFTER NiiVue processes the `mousedown`, so blocking at `contextmenu` time was too late.

**Fix:** Added a `mousedown` capture-phase listener for button===2 that calls `stopImmediatePropagation()` to block NiiVue's drag handler. The existing `contextmenu` handler then shows the custom menu on the subsequent event.

### 2. Alt+Right-Click for Intensity Adjustment
**Problem:** Alt+left click was implemented (quick-002) but NiiVue only uses right-button drag for contrast/intensity adjustment. Alt+left click had no effect.

**Fix:** When Alt is held during right-click mousedown, the event is NOT blocked — NiiVue processes it normally for window/level adjustment. A flag (`isRightClickIntensity`) suppresses the custom context menu on the subsequent `contextmenu` event. The old Alt+left click handler was removed.

### 3. Crosshair Toggle (New Feature)
**Button:** Added crosshair icon button in the top-right orientation menu bar. Toggles `nv.opts.crosshairWidth` between 0 (hidden) and 1 (visible). Button turns red when crosshair is hidden.

**Context Menu:** Added "Hide Crosshair" / "Show Crosshair" option after "Reset View" in the right-click context menu. Keeps button state in sync.

## Event Flow

```
Right-click (no Alt):
  mousedown(btn=2) → stopImmediatePropagation (blocks NiiVue)
  contextmenu → preventDefault + show custom menu

Alt+Right-click:
  mousedown(btn=2, altKey) → NiiVue handles drag (intensity)
  mousemove → NiiVue draws intensity rectangle
  mouseup → reset flag
  contextmenu → preventDefault only (no custom menu)
```

## Files Modified

- `static/js/viewer_grid.js` — Replaced contextmenu-only handler with mousedown+contextmenu pair; removed Alt+left click handler; added crosshair toggle button HTML, handler, and context menu option
- `static/css/viewer_grid.css` — Added `.crosshair-toggle-btn` styles with red hidden state
