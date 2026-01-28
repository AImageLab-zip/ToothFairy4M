---
created: 2026-01-28T16:18
title: Refactor VolumeViewer for modularity and async loading
area: frontend
files:
  - static/js/modality_viewers/volume_viewer.js
  - static/js/modality_viewers/cbct.js
---

## Problem

The VolumeViewer (formerly CBCTViewer) is a large monolithic file (~1500 lines) that handles:
- NIfTI parsing and volume data loading
- Three.js scene setup and rendering
- Slice texture generation for axial/sagittal/coronal views
- User interaction (scroll, zoom, pan)
- Windowing/level adjustments
- Panoramic image handling (CBCT-specific)

This makes the code harder to maintain and test. Additionally, volume loading is synchronous which blocks the UI during large volume decompression and parsing.

## Solution

1. **Modular architecture** - Split into smaller focused modules:
   - `volume-loader.js` - NIfTI parsing, data loading
   - `slice-renderer.js` - Three.js slice rendering
   - `volume-interaction.js` - Scroll, zoom, pan handlers
   - `windowing.js` - Window/level calculations
   - `volume-viewer.js` - Main orchestrator (slim)

2. **Background async loading** - Use Web Workers for:
   - NIfTI decompression (gzip)
   - Volume data parsing
   - Slice texture generation (pre-render common slices)

3. **Preload volumes on page load** - Start loading all modalities in background when patient detail page opens, so volumes are ready when user drops them into windows.

TBD: Evaluate if SharedArrayBuffer can be used for zero-copy worker communication.
