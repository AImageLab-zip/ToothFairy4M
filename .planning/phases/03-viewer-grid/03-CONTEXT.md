# Phase 3: Viewer Grid - Context

**Gathered:** 2026-01-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Build a 2x2 grid interface for brain patient detail where users can drag modalities (T1, T2, FLAIR, T1c) from a top bar and drop them into viewer windows. Each window loads and displays the dropped modality. Actual slice rendering and synchronized scrolling are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Grid layout
- Resizable windows — users can drag borders to resize individual windows
- Grid with top bar — patient info and modality chips above, grid below
- Empty windows show drop zone hint — dashed border with "Drop modality here" text

### Drag-drop interaction
- Drag from top bar chips — modalities displayed as draggable pills/chips in top bar
- Overlay hint on drag-over — semi-transparent overlay with "Drop here" text when hovering
- Replace immediately — dropping on occupied window replaces without confirmation
- Drag only — no click-to-load, must drag to specific window

### Modality list display
- Short codes — T1, T2, FLAIR, T1c (compact labels)
- Visual indicator — checkmark or badge showing which window contains the modality
- Show disabled for missing — all 4 modalities always visible, unavailable ones greyed out
- Same color — all chips same style, text differentiates them

### Window states
- Spinner centered — loading indicator in center of window while fetching
- Label in corner — small modality code (e.g., "T1") in top-left corner when loaded
- Right-click menu — context menu with "Clear" option to unload modality
- Error message — red text explaining error with retry option if file fails to load

### Claude's Discretion
- Window border styling and spacing (match existing UI patterns)
- Exact chip styling and hover states
- Loading spinner appearance
- Error message wording

</decisions>

<specifics>
## Specific Ideas

- Top bar layout with draggable chips enables quick comparison workflow
- Resizable windows allow focusing on specific modality when needed
- Visual indicators for loaded modalities prevent confusion about window contents

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-viewer-grid*
*Context gathered: 2026-01-28*
