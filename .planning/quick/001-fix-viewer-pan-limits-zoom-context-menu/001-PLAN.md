---
type: quick
task_count: 3
files_modified:
  - static/js/viewer_grid.js
  - static/css/viewer_grid.css
autonomous: true

must_haves:
  truths:
    - "Pan limits prevent image edge from exceeding half window width while zoomed"
    - "Right-click opens custom context menu instead of drawing intensity square"
    - "Zoom centers on mouse cursor position instead of bottom-left corner"
  artifacts:
    - path: "static/js/viewer_grid.js"
      provides: "Fixed pan clamping, zoom toward cursor, right-click context menu"
      min_lines: 850
    - path: "static/css/viewer_grid.css"
      provides: "Context menu styling"
      contains: ".viewer-context-menu"
  key_links:
    - from: "canvas wheel event (Ctrl+scroll)"
      to: "nv.scene.pan2Dxyzmm zoom property"
      via: "zoom calculation with cursor-centered offset"
      pattern: "const.*zoomFactor.*offset"
    - from: "canvas contextmenu event"
      to: "showContextMenu()"
      via: "preventDefault() before NiiVue handler"
      pattern: "contextmenu.*preventDefault.*showContextMenu"
---

<objective>
Fix three viewer interaction issues reported from Phase 5 user testing:

1. **Pan limits while zoomed** - Currently image can pan too far. Left/top/bottom/right image border should not exceed half of window width.
2. **Right-click context menu** - Right-click currently draws a square and changes intensity. Need custom menu with: A/S/C orientation buttons, center/reset view, and unlink (free-scroll toggle).
3. **Zoom toward cursor** - Zoom should center on mouse cursor position, not bottom-left corner.

Purpose: Improve viewer UX to match medical imaging standards
Output: Fixed zoom/pan behavior and functional right-click context menu
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-quick-task.md
</execution_context>

<context>
@./static/js/viewer_grid.js
@./static/css/viewer_grid.css

**Current implementation:**
- Ctrl+scroll zoom: Lines 539-553 in viewer_grid.js
- Ctrl+drag pan: Lines 566-607 in viewer_grid.js
- Pan clamping formula: `maxPan = Math.max(0, (zoom - 1) / zoom) * (canvas.clientWidth / 2)` (line 592)
- Right-click: Basic context menu in initContextMenus() (lines 729-754) only clears window
- NiiVue property: `nv.scene.pan2Dxyzmm = [x, y, z, zoom]`

**Issues:**
1. Pan clamping allows image border to go past half window width (too permissive)
2. Right-click draws intensity square before context menu appears (NiiVue default behavior interferes)
3. Zoom changes zoom level but doesn't adjust pan offset to center on cursor
</context>

<tasks>

<task type="auto">
  <name>Fix pan limits to prevent image border exceeding half window width</name>
  <files>static/js/viewer_grid.js</files>
  <action>
Update pan clamping logic in Ctrl+drag pan handler (lines 589-594):

Current formula is too permissive. The image border can go past canvas center.

**New clamping logic:**
- At zoom=1x: maxPan=0 (no pan, image fills canvas)
- At zoom>1x: Calculate based on visible canvas vs image dimensions
- Formula: `maxPan = (canvas.clientWidth / 2) * (1 - 1/zoom)`
  - At 2x zoom: maxPan = canvasWidth/2 * 0.5 = 25% of canvas width
  - At 5x zoom: maxPan = canvasWidth/2 * 0.8 = 40% of canvas width

Update both locations where clamping occurs:
1. In Ctrl+scroll zoom handler (lines 549-552) after zoom calculation
2. In Ctrl+drag pan handler (lines 589-594) during mousemove

Replace current `maxPan` calculation with:
```javascript
const maxPan = (canvas.clientWidth / 2) * (1 - 1/newZoom); // for zoom handler
const maxPan = (canvas.clientWidth / 2) * (1 - 1/zoom);    // for pan handler
```

Keep the same clamping application:
```javascript
const clampedX = Math.max(-maxPan, Math.min(maxPan, pan[0]));
const clampedY = Math.max(-maxPan, Math.min(maxPan, pan[1]));
```
  </action>
  <verify>
Load a modality, Ctrl+scroll to zoom to 2x, try to pan image. Left border should stop when it reaches half canvas width (cannot go further right). Same for all edges.

At 5x zoom, image should have more pan range but still respect the half-width boundary.
  </verify>
  <done>Pan clamping prevents any image border from exceeding half of canvas width at all zoom levels</done>
</task>

<task type="auto">
  <name>Add zoom toward mouse cursor (not bottom-left corner)</name>
  <files>static/js/viewer_grid.js</files>
  <action>
Update Ctrl+scroll zoom handler (lines 539-553) to zoom toward cursor position instead of fixed point.

**Current behavior:** Zoom changes zoom level but doesn't adjust pan offset, so zoom appears centered on bottom-left.

**Fix approach:**
1. Calculate mouse position relative to canvas center BEFORE zoom
2. Apply new zoom level
3. Adjust pan offset so the world position under cursor remains stationary

**Implementation:**

Replace lines 539-553 with:
```javascript
canvas.addEventListener('wheel', (e) => {
    if (e.ctrlKey) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const nv = viewer.nv;
        const pan = nv.scene.pan2Dxyzmm;
        const currentZoom = pan[3] || 1;
        const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
        const newZoom = Math.max(1, Math.min(5, currentZoom * zoomFactor));

        // Calculate mouse position relative to canvas center (in screen pixels)
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left - rect.width / 2;
        const mouseY = e.clientY - rect.top - rect.height / 2;

        // Adjust pan to keep cursor position stationary during zoom
        // Formula: newPan = oldPan + mouseOffset * (1 - newZoom/oldZoom)
        const zoomRatio = newZoom / currentZoom;
        const newPanX = pan[0] + mouseX * (1 - zoomRatio);
        const newPanY = pan[1] - mouseY * (1 - zoomRatio); // Y inverted

        // Apply new clamping formula
        const maxPan = (canvas.clientWidth / 2) * (1 - 1/newZoom);
        const clampedX = Math.max(-maxPan, Math.min(maxPan, newPanX));
        const clampedY = Math.max(-maxPan, Math.min(maxPan, newPanY));

        nv.scene.pan2Dxyzmm = [clampedX, clampedY, pan[2], newZoom];
        nv.drawScene();
    } else if (e.shiftKey) {
        // ... existing shift+scroll code unchanged ...
    }
}, { capture: true });
```

Keep Shift+scroll handler (lines 554-563) unchanged.
  </action>
  <verify>
Load a modality, position mouse over a specific anatomical feature, Ctrl+scroll to zoom. The feature under the cursor should remain under the cursor as zoom changes (not shift toward edges).

Test at different cursor positions (center, edges, corners).
  </verify>
  <done>Zoom centers on mouse cursor position - anatomical feature under cursor remains stationary during zoom in/out</done>
</task>

<task type="auto">
  <name>Replace right-click behavior with custom context menu</name>
  <files>static/js/viewer_grid.js, static/css/viewer_grid.css</files>
  <action>
**Part 1: Disable NiiVue's right-click behavior (viewer_grid.js)**

NiiVue uses right-click for intensity adjustment by default. Need to prevent this BEFORE NiiVue's handler runs.

Add contextmenu event listener in capture phase when creating canvas handlers (after line 535, before wheel event):

```javascript
// Disable NiiVue's default right-click behavior (intensity adjustment square)
canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopImmediatePropagation();

    // Show custom context menu at cursor position
    const rect = canvas.getBoundingClientRect();
    showViewerContextMenu(e.clientX, e.clientY, windowIndex, viewer);
}, { capture: true });
```

**Part 2: Create enhanced context menu (viewer_grid.js)**

Replace showContextMenu() function (lines 759-798) with enhanced version:

```javascript
/**
 * Show context menu for viewer window at cursor position
 */
function showViewerContextMenu(x, y, windowIndex, viewer) {
    // Remove existing menu
    const existingMenu = document.getElementById('viewerContextMenu');
    if (existingMenu) {
        existingMenu.remove();
    }

    const windowEl = document.querySelector(`.viewer-window[data-window-index="${windowIndex}"]`);
    const currentOrientation = windowStates[windowIndex].currentOrientation;
    const isFreeScroll = freeScrollWindows[windowIndex];

    // Create menu
    const menu = document.createElement('div');
    menu.id = 'viewerContextMenu';
    menu.className = 'viewer-context-menu';
    menu.style.top = `${y}px`;
    menu.style.left = `${x}px`;

    // Orientation section
    const orientSection = document.createElement('div');
    orientSection.className = 'context-menu-section';
    orientSection.innerHTML = '<div class="context-menu-label">Orientation</div>';

    const orientButtons = document.createElement('div');
    orientButtons.className = 'context-menu-orientation-buttons';
    ['axial', 'sagittal', 'coronal'].forEach(orient => {
        const btn = document.createElement('button');
        btn.textContent = orient[0].toUpperCase();
        btn.className = 'context-menu-orient-btn' + (orient === currentOrientation ? ' active' : '');
        btn.onclick = () => {
            viewer.setOrientation(orient);
            const menuBtns = windowEl.querySelectorAll('.orientation-btn');
            menuBtns.forEach(b => b.classList.remove('active'));
            const targetBtn = windowEl.querySelector(`.orientation-btn[data-orientation="${orient}"]`);
            if (targetBtn) targetBtn.classList.add('active');
            windowStates[windowIndex].currentOrientation = orient;
            updateOrientationGroup(windowIndex, orient);
            if (!freeScrollWindows[windowIndex]) {
                const consensusSlice = getGroupConsensusSlice(orient);
                viewer.setSliceIndex(consensusSlice);
            }
            menu.remove();
        };
        orientButtons.appendChild(btn);
    });
    orientSection.appendChild(orientButtons);
    menu.appendChild(orientSection);

    // Actions section
    const actionsSection = document.createElement('div');
    actionsSection.className = 'context-menu-section';

    // Reset view option
    const resetOption = createMenuOption(
        'compress-arrows-alt',
        'Reset View',
        () => {
            if (viewer.nv) {
                viewer.nv.scene.pan2Dxyzmm = [0, 0, 0, 1];
                viewer.nv.drawScene();
            }
            menu.remove();
        }
    );
    actionsSection.appendChild(resetOption);

    // Unlink/sync option
    const unlinkOption = createMenuOption(
        isFreeScroll ? 'link' : 'link-slash',
        isFreeScroll ? 'Re-sync Scrolling' : 'Unlink (Free Scroll)',
        () => {
            freeScrollWindows[windowIndex] = !freeScrollWindows[windowIndex];
            const freeScrollBtn = windowEl.querySelector('.free-scroll-btn');
            if (freeScrollBtn) {
                const icon = freeScrollBtn.querySelector('i');
                if (freeScrollWindows[windowIndex]) {
                    freeScrollBtn.classList.add('free-scroll-active');
                    icon.classList.remove('fa-link');
                    icon.classList.add('fa-link-slash');
                } else {
                    freeScrollBtn.classList.remove('free-scroll-active');
                    icon.classList.remove('fa-link-slash');
                    icon.classList.add('fa-link');
                    const consensusSlice = getGroupConsensusSlice(windowStates[windowIndex].currentOrientation);
                    viewer.setSliceIndex(consensusSlice);
                }
            }
            menu.remove();
        }
    );
    actionsSection.appendChild(unlinkOption);

    // Clear window option
    const clearOption = createMenuOption(
        'times',
        'Clear Window',
        () => {
            clearWindow(windowIndex);
            menu.remove();
        }
    );
    actionsSection.appendChild(clearOption);

    menu.appendChild(actionsSection);
    document.body.appendChild(menu);

    // Position menu to stay on screen
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
        menu.style.left = `${x - rect.width}px`;
    }
    if (rect.bottom > window.innerHeight) {
        menu.style.top = `${y - rect.height}px`;
    }
}

/**
 * Helper to create context menu option
 */
function createMenuOption(iconClass, text, onClick) {
    const option = document.createElement('div');
    option.className = 'context-menu-option';
    option.innerHTML = `<i class="fas fa-${iconClass} me-2"></i>${text}`;
    option.onclick = onClick;
    return option;
}
```

Remove old showContextMenu function (lines 759-798) and clearWindow contextmenu handler references to it.

**Part 3: Add context menu CSS (viewer_grid.css)**

Add at end of file:

```css
/* Context Menu Styles */
.viewer-context-menu {
    position: fixed;
    background: white;
    border: 1px solid #dee2e6;
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 1000;
    min-width: 180px;
    padding: 8px 0;
    font-size: 14px;
}

.context-menu-section {
    padding: 4px 0;
}

.context-menu-section + .context-menu-section {
    border-top: 1px solid #e9ecef;
    margin-top: 4px;
    padding-top: 8px;
}

.context-menu-label {
    padding: 4px 16px;
    font-size: 11px;
    font-weight: 600;
    color: #6c757d;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.context-menu-orientation-buttons {
    display: flex;
    gap: 4px;
    padding: 4px 16px;
}

.context-menu-orient-btn {
    flex: 1;
    padding: 6px 12px;
    border: 1px solid #dee2e6;
    background: white;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 600;
    transition: all 0.2s;
}

.context-menu-orient-btn:hover {
    background: #f8f9fa;
    border-color: #0d6efd;
}

.context-menu-orient-btn.active {
    background: #0d6efd;
    color: white;
    border-color: #0d6efd;
}

.context-menu-option {
    padding: 8px 16px;
    cursor: pointer;
    user-select: none;
    transition: background 0.15s;
}

.context-menu-option:hover {
    background: #f8f9fa;
}

.context-menu-option i {
    width: 16px;
    text-align: center;
}
```
  </action>
  <verify>
Load a modality in any window. Right-click on the canvas:
1. No intensity adjustment square should appear
2. Custom context menu appears at cursor
3. Menu shows: Orientation section (A/S/C buttons), Reset View, Unlink/Re-sync, Clear Window
4. Click A/S/C buttons changes orientation
5. Click Reset View resets zoom and pan
6. Click Unlink toggles free-scroll state
7. Click Clear Window removes modality

Test that menu closes when clicking outside it (existing document click handler should work).
  </verify>
  <done>Right-click opens custom context menu with orientation controls, reset view, unlink toggle, and clear window - no intensity square appears</done>
</task>

</tasks>

<verification>
**Pan limits:**
- Load modality, zoom to 2x, attempt to pan until image border reaches canvas center - should stop there
- At 5x zoom, verify increased pan range but still respects boundary

**Zoom toward cursor:**
- Position cursor over specific anatomical feature, Ctrl+scroll to zoom in/out
- Feature under cursor should remain under cursor (not drift)

**Right-click menu:**
- Right-click canvas shows menu immediately (no intensity square flash)
- Menu contains all expected options
- All menu actions work correctly
</verification>

<success_criteria>
- Pan clamping formula updated to `(canvas.clientWidth / 2) * (1 - 1/zoom)` in both zoom and pan handlers
- Zoom handler calculates mouse offset and adjusts pan to keep cursor position stationary
- Right-click contextmenu event listener added in capture phase to prevent NiiVue's default behavior
- Custom context menu implemented with orientation buttons, reset view, unlink toggle, clear window
- CSS styling added for context menu appearance
- All three issues fixed and verified working
</success_criteria>

<output>
After completion, create `.planning/quick/001-fix-viewer-pan-limits-zoom-context-menu/001-SUMMARY.md`
</output>
