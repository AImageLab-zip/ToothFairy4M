---
task: 003
type: quick
autonomous: true
files_modified:
  - static/js/viewer_grid.js
  - static/css/viewer_grid.css
---

<objective>
Fix three viewer interaction issues:
1. Right-click still triggers NiiVue intensity square alongside custom context menu
2. Alt+left click intensity adjustment doesn't work (NiiVue only supports right-button drag for contrast)
3. Add crosshair hide/show toggle as button and context menu option
</objective>

<tasks>

<task type="auto">
  <name>Fix right-click and add Alt+right-click intensity adjustment</name>
  <files>static/js/viewer_grid.js</files>
  <action>
  - Add mousedown capture handler for button===2 that blocks NiiVue unless Alt is held
  - When Alt+right click: set flag, let NiiVue handle intensity drag
  - When regular right click: stopImmediatePropagation to block NiiVue
  - Update contextmenu handler to skip custom menu when Alt was held
  - Remove broken Alt+left click handler
  </action>
</task>

<task type="auto">
  <name>Add crosshair toggle button and context menu option</name>
  <files>static/js/viewer_grid.js, static/css/viewer_grid.css</files>
  <action>
  - Add crosshair-toggle-btn to orientation menu HTML
  - Add click handler toggling nv.opts.crosshairWidth between 0 and 1
  - Add "Hide/Show Crosshair" to context menu after Reset View
  - CSS: crosshair button with red state when hidden
  </action>
</task>

</tasks>
