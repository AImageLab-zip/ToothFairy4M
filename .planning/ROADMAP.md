# Roadmap: ToothFairy4M Brain Viewer

## Overview

This milestone transforms ToothFairy4M from a maxillofacial-only platform into a multi-specialty medical imaging system by adding brain MRI visualization capabilities. The journey starts by cleaning up the permission architecture to support multiple projects cleanly, then builds out brain-specific upload workflows and a specialized 2x2 grid viewer that lets radiologists compare multiple MRI modalities side-by-side with synchronized navigation.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Permission Refactoring** - Consolidate dual profile system into unified ProjectAccess
- [ ] **Phase 2: Brain Upload** - Enable T1/T2/FLAIR/T1c modality uploads
- [ ] **Phase 3: Viewer Grid** - Build 2x2 grid with drag-drop modality loading
- [ ] **Phase 4: Viewer Display** - Integrate NiiVue for multi-plane volume viewing
- [ ] **Phase 5: Viewer Synchronization** - Synchronized scrolling across windows

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
**Plans**: TBD

Plans:
- [ ] TBD

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
**Plans**: TBD

Plans:
- [ ] TBD

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
**Plans**: TBD

Plans:
- [ ] TBD

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
**Plans**: TBD

Plans:
- [ ] TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Permission Refactoring | 4/4 | Complete | 2026-01-27 |
| 2. Brain Upload | 0/TBD | Not started | - |
| 3. Viewer Grid | 0/TBD | Not started | - |
| 4. Viewer Display | 0/TBD | Not started | - |
| 5. Viewer Synchronization | 0/TBD | Not started | - |
