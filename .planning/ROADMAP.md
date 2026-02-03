# Roadmap: ToothFairy4M Brain Viewer

## Overview

This milestone transforms ToothFairy4M from a maxillofacial-only platform into a multi-specialty medical imaging system by adding brain MRI visualization capabilities. The journey starts by cleaning up the permission architecture to support multiple projects cleanly, then builds out brain-specific upload workflows and a specialized 2x2 grid viewer that lets radiologists compare multiple MRI modalities side-by-side with synchronized navigation.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Permission Refactoring** - Consolidate dual profile system into unified ProjectAccess
- [x] **Phase 2: Brain Upload** - Enable T1/T2/FLAIR/T1c modality uploads
- [x] **Phase 3: Viewer Grid** - Build 2x2 grid with drag-drop modality loading
- [x] **Phase 4: Viewer Display** - Integrate NiiVue for multi-plane volume viewing
- [x] **Phase 5: Viewer Synchronization** - Synchronized scrolling across windows
- [x] **Phase 6: VolumeViewer Refactoring** - Modular architecture and async loading
- [ ] **Phase 7: Maxillo NiiVue Migration** - Replace Three.js cbct.js with NiiVue-based viewer

## Phase Details

### Phase 1: Permission Refactoring
**Goal**: Clean permission model with single source of truth for roles
**Depends on**: Nothing (first phase)
**Requirements**: REF-01, REF-02, REF-03, REF-04, REF-05
**Success Criteria** (what must be TRUE):
  1. User roles are stored in ProjectAccess.role field (not in separate UserProfile models)
  2. Permission checks use ProjectAccess.role consistently across all views and middleware
  3. MaxilloUserProfile and BrainUserProfile models are removed from codebase
  4. Existing users can still access their projects with correct permissions after migration
  5. No duplicate permission checking code exists in views or middleware
**Plans**: 4 plans

Plans:
- [x] 01-01-PLAN.md — Add role field to ProjectAccess and migrate data from profiles
- [x] 01-02-PLAN.md — Update all permission checks to use ProjectAccess.role
- [x] 01-03-PLAN.md — Update views and templates to use ProjectAccess
- [x] 01-04-PLAN.md — Remove deprecated UserProfile models and boolean fields

### Phase 2: Brain Upload
**Goal**: Users can upload and track brain MRI modalities
**Depends on**: Phase 1
**Requirements**: UPL-01, UPL-02, UPL-03, UPL-04, UPL-05, UPL-06
**Success Criteria** (what must be TRUE):
  1. User can upload T1 modality files in .nii.gz format via brain project
  2. User can upload T2 modality files in .nii.gz format via brain project
  3. User can upload FLAIR modality files in .nii.gz format via brain project
  4. User can upload T1c modality files in .nii.gz format via brain project
  5. Uploaded brain modalities appear immediately in patient detail (no processing wait)
  6. FileRegistry correctly shows brain modalities with appropriate file_type values
**Plans**: 2 plans

Plans:
- [x] 02-01-PLAN.md — Enable brain modality upload infrastructure
- [x] 02-02-PLAN.md — Verify brain upload flow end-to-end

### Phase 3: Viewer Grid
**Goal**: Users can load modalities into a 2x2 viewer grid via drag-drop
**Depends on**: Phase 2
**Requirements**: GRID-01, GRID-02, GRID-03, GRID-04, GRID-05, GRID-06
**Success Criteria** (what must be TRUE):
  1. Brain patient detail page displays a 2x2 grid of empty viewer windows on load
  2. Available modalities (T1/T2/FLAIR/T1c) are displayed as draggable elements
  3. User can drag a modality from the list and drop it into any window
  4. Dropped modality loads and displays in the target window
  5. User can replace a window's modality by dropping a different one on it
**Plans**: 3 plans

Plans:
- [x] 03-01-PLAN.md — Create 2x2 grid layout with empty window states
- [x] 03-02-PLAN.md — Implement drag-drop interaction and state management
- [x] 03-03-PLAN.md — Wire volume loading and window display

### Phase 4: Viewer Display
**Goal**: Each window displays NIfTI volumes with multi-plane navigation
**Depends on**: Phase 3
**Requirements**: DISP-01, DISP-02, DISP-03, DISP-04, DISP-05
**Success Criteria** (what must be TRUE):
  1. Each window renders NIfTI volume slices using NiiVue library
  2. Windows default to axial orientation when modality is loaded
  3. User can switch any window between axial, sagittal, and coronal views via menu
  4. User can scroll through slices with mouse wheel in each window
  5. Volumes are cached after first load (re-loading same modality is instant)
**Plans**: 3 plans

Plans:
- [x] 04-01-PLAN.md — Add NiiVue library and create niivue_viewer.js wrapper
- [x] 04-02-PLAN.md — Integrate NiiVue with viewer_grid.js and add orientation menu
- [x] 04-03-PLAN.md — Implement volume caching, error handling, and cleanup

### Phase 5: Viewer Synchronization
**Goal**: Windows scroll together when viewing same orientation
**Depends on**: Phase 4
**Requirements**: SYNC-01, SYNC-02, SYNC-03, SYNC-04, SYNC-05
**Success Criteria** (what must be TRUE):
  1. Windows showing the same orientation (e.g., both axial) are synchronized by default
  2. Scrolling in one synchronized window causes all others with same orientation to scroll to the same slice
  3. Each window has a "Free Scroll" toggle button to break synchronization
  4. Clicking "Free Scroll" again re-synchronizes the window to the current group slice position
  5. Windows with different orientations (e.g., axial vs sagittal) operate independently
**Plans**: 2 plans

Plans:
- [x] 05-01-PLAN.md — Implement synchronization groups and event-driven slice propagation
- [x] 05-02-PLAN.md — Verify synchronized scrolling behavior

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7

| Phase | Plans Complete | Status | Completed |
|-----|----------------|--------|-----|--|
| 1. Permission Refactoring | 4/4 | Complete | 2026-01-27 |
| 2. Brain Upload | 2/2 | Complete | 2026-01-28 |
| 3. Viewer Grid | 3/3 | Complete | 2026-01-28 |
| 4. Viewer Display | 3/3 | Complete | 2026-01-28 |
| 5. Viewer Synchronization | 2/2 | Complete | 2026-01-29 |
| 6. VolumeViewer Refactoring | 3/3 | Complete | 2026-02-02 |
| 7. Maxillo NiiVue Migration | 0/4 | Pending | - |

## Summary

All 6 phases of the Brain Viewer milestone are complete. The milestone delivers a complete multi-specialty medical imaging viewer with brain MRI comparison workflows, modular VolumeViewer architecture, Web Worker-based background parsing, and volume preloading for instant viewer initialization.

### Phase 6: VolumeViewer Refactoring
**Goal**: Modular architecture and async loading for improved maintainability and performance
**Depends on**: Phase 5
**Requirements**: MOD-01, MOD-02, MOD-03, MOD-04
**Success Criteria** (what must be TRUE):
  1. VolumeViewer code is split into smaller focused modules (volume-loader.js, slice-renderer.js, volume-interaction.js, windowing.js, volume-viewer.js)
  2. Volume loading uses Web Workers for background processing
  3. Volumes preload on page load for faster user experience
  4. Code maintainability and testability are improved
**Plans**: 3 plans

Plans:
- [x] 06-01-PLAN.md — Split monolithic VolumeViewer into modular components
- [x] 06-02-PLAN.md — Implement Web Workers for background volume loading
- [x] 06-03-PLAN.md — Add volume preloading and performance optimization

### Phase 7: Maxillo NiiVue Migration
**Goal**: Replace Three.js-based CBCT viewer with NiiVue for unified codebase and optimized performance
**Depends on**: Phase 6
**Requirements**: MIG-01, MIG-02, MIG-03, MIG-04, MIG-05
**Success Criteria** (what must be TRUE):
  1. Maxillo CBCT viewer uses NiiVue instead of Three.js for volume rendering
  2. Fixed 2x2 layout shows Axial, Sagittal, Coronal, and 3D placeholder views
  3. Cross-view synchronization works (scrolling in one view updates crosshairs in others)
  4. Panoramic view remains as a separate 2D image (not NiiVue)
  5. Performance is improved (rAF throttling, drawScene instead of full re-render)
  6. Windowing controls continue to function for adjusting contrast
**Plans**: 4 plans

Plans:
- [ ] 07-01-PLAN.md — Create MaxilloNiiVueViewer class with windowing adapter
- [ ] 07-02-PLAN.md — Update Maxillo templates for NiiVue integration
- [ ] 07-03-PLAN.md — Complete interactions and human verification
- [ ] 07-04-PLAN.md — Clean up legacy Three.js code
