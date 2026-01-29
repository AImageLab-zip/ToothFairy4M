# Requirements: ToothFairy4M Brain Viewer

**Defined:** 2026-01-26
**Core Value:** Clinicians can quickly visualize and compare multiple MRI modalities side-by-side with synchronized navigation

## v1 Requirements

Requirements for this milestone. Each maps to roadmap phases.

### Refactoring

- [x] **REF-01**: Consolidate MaxilloUserProfile and BrainUserProfile into ProjectAccess with role field
- [x] **REF-02**: Remove can_view and can_upload fields from ProjectAccess (roles handle permissions)
- [x] **REF-03**: Update all permission checks to use ProjectAccess.role instead of UserProfile methods
- [x] **REF-04**: Remove UserProfile models and related signals after migration
- [x] **REF-05**: Update middleware to resolve roles from ProjectAccess instead of UserProfile

### Brain Upload

- [x] **UPL-01**: Brain project supports T1 modality upload (nii.gz format)
- [x] **UPL-02**: Brain project supports T2 modality upload (nii.gz format)
- [x] **UPL-03**: Brain project supports FLAIR modality upload (nii.gz format)
- [x] **UPL-04**: Brain project supports T1c modality upload (nii.gz format)
- [x] **UPL-05**: Uploaded brain modalities are immediately available (no processing job required)
- [x] **UPL-06**: FileRegistry correctly tracks brain modality files with appropriate file_type

### Brain Viewer Grid

- [x] **GRID-01**: Patient detail page shows 2x2 grid of viewer windows for brain project
- [x] **GRID-02**: Windows start empty when page loads
- [x] **GRID-03**: Modality list (T1/T2/FLAIR/T1c) displayed as draggable elements
- [x] **GRID-04**: User can drag modality from list and drop into any window
- [x] **GRID-05**: Window displays the dropped modality's volume
- [x] **GRID-06**: User can replace modality in window by dropping different one

### Brain Viewer Display

- [x] **DISP-01**: Each window displays NIfTI volume slices using NiiVue
- [x] **DISP-02**: Default view is axial orientation
- [x] **DISP-03**: Per-window menu to switch between axial, sagittal, and coronal views
- [x] **DISP-04**: Mouse scroll changes slice within the volume
- [x] **DISP-05**: Volume data cached on first load for fast subsequent access

### Brain Viewer Synchronization

- [x] **SYNC-01**: Windows showing same orientation are synchronized by default
- [x] **SYNC-02**: Scrolling in one synchronized window scrolls all others to same slice
- [x] **SYNC-03**: Per-window "Free Scroll" toggle button to break synchronization
- [x] **SYNC-04**: Clicking "Free Scroll" again re-syncs window to current group slice
- [x] **SYNC-05**: Windows with different orientations operate independently

## v2 Requirements

Deferred to future milestone. Tracked but not in current roadmap.

### Crosshair Navigation

- **CROSS-01**: Crosshair reference lines displayed in each window
- **CROSS-02**: Toggle between display-only and click-to-navigate modes
- **CROSS-03**: Click on crosshair navigates all synced windows to that anatomical point

### Measurements

- **MEAS-01**: Distance measurement tool
- **MEAS-02**: Area/ROI measurement tool
- **MEAS-03**: Window/level adjustment controls

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| 3D volume rendering | Slice-based viewing sufficient for v1 |
| Annotations/markup | Not core to comparison workflow |
| Report generation | Separate feature, not viewer concern |
| Mobile support | Desktop-first for radiology workstation use |
| Real-time collaboration | Not needed for v1 |
| Video export | Static slice navigation sufficient |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| REF-01 | Phase 1 | Complete |
| REF-02 | Phase 1 | Complete |
| REF-03 | Phase 1 | Complete |
| REF-04 | Phase 1 | Complete |
| REF-05 | Phase 1 | Complete |
| UPL-01 | Phase 2 | Complete |
| UPL-02 | Phase 2 | Complete |
| UPL-03 | Phase 2 | Complete |
| UPL-04 | Phase 2 | Complete |
| UPL-05 | Phase 2 | Complete |
| UPL-06 | Phase 2 | Complete |
| GRID-01 | Phase 3 | Complete |
| GRID-02 | Phase 3 | Complete |
| GRID-03 | Phase 3 | Complete |
| GRID-04 | Phase 3 | Complete |
| GRID-05 | Phase 3 | Complete |
| GRID-06 | Phase 3 | Complete |
| DISP-01 | Phase 4 | Complete |
| DISP-02 | Phase 4 | Complete |
| DISP-03 | Phase 4 | Complete |
| DISP-04 | Phase 4 | Complete |
| DISP-05 | Phase 4 | Complete |
| SYNC-01 | Phase 5 | Complete |
| SYNC-02 | Phase 5 | Complete |
| SYNC-03 | Phase 5 | Complete |
| SYNC-04 | Phase 5 | Complete |
| SYNC-05 | Phase 5 | Complete |

**Coverage:**
- v1 requirements: 22 total
- Mapped to phases: 22
- Unmapped: 0 ✓

---
*Requirements defined: 2026-01-26*
*Last updated: 2026-01-29 after Phase 5 completion*
