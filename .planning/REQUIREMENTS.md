# Requirements: ToothFairy4M Brain Viewer

**Defined:** 2026-01-26
**Core Value:** Clinicians can quickly visualize and compare multiple MRI modalities side-by-side with synchronized navigation

## v1 Requirements

Requirements for this milestone. Each maps to roadmap phases.

### Refactoring

- [ ] **REF-01**: Consolidate MaxilloUserProfile and BrainUserProfile into ProjectAccess with role field
- [ ] **REF-02**: Remove can_view and can_upload fields from ProjectAccess (roles handle permissions)
- [ ] **REF-03**: Update all permission checks to use ProjectAccess.role instead of UserProfile methods
- [ ] **REF-04**: Remove UserProfile models and related signals after migration
- [ ] **REF-05**: Update middleware to resolve roles from ProjectAccess instead of UserProfile

### Brain Upload

- [ ] **UPL-01**: Brain project supports T1 modality upload (nii.gz format)
- [ ] **UPL-02**: Brain project supports T2 modality upload (nii.gz format)
- [ ] **UPL-03**: Brain project supports FLAIR modality upload (nii.gz format)
- [ ] **UPL-04**: Brain project supports T1c modality upload (nii.gz format)
- [ ] **UPL-05**: Uploaded brain modalities are immediately available (no processing job required)
- [ ] **UPL-06**: FileRegistry correctly tracks brain modality files with appropriate file_type

### Brain Viewer Grid

- [ ] **GRID-01**: Patient detail page shows 2x2 grid of viewer windows for brain project
- [ ] **GRID-02**: Windows start empty when page loads
- [ ] **GRID-03**: Modality list (T1/T2/FLAIR/T1c) displayed as draggable elements
- [ ] **GRID-04**: User can drag modality from list and drop into any window
- [ ] **GRID-05**: Window displays the dropped modality's volume
- [ ] **GRID-06**: User can replace modality in window by dropping different one

### Brain Viewer Display

- [ ] **DISP-01**: Each window displays NIfTI volume slices using NiiVue
- [ ] **DISP-02**: Default view is axial orientation
- [ ] **DISP-03**: Per-window menu to switch between axial, sagittal, and coronal views
- [ ] **DISP-04**: Mouse scroll changes slice within the volume
- [ ] **DISP-05**: Volume data cached on first load for fast subsequent access

### Brain Viewer Synchronization

- [ ] **SYNC-01**: Windows showing same orientation are synchronized by default
- [ ] **SYNC-02**: Scrolling in one synchronized window scrolls all others to same slice
- [ ] **SYNC-03**: Per-window "Free Scroll" toggle button to break synchronization
- [ ] **SYNC-04**: Clicking "Free Scroll" again re-syncs window to current group slice
- [ ] **SYNC-05**: Windows with different orientations operate independently

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
| REF-01 | Phase 1 | Pending |
| REF-02 | Phase 1 | Pending |
| REF-03 | Phase 1 | Pending |
| REF-04 | Phase 1 | Pending |
| REF-05 | Phase 1 | Pending |
| UPL-01 | Phase 2 | Pending |
| UPL-02 | Phase 2 | Pending |
| UPL-03 | Phase 2 | Pending |
| UPL-04 | Phase 2 | Pending |
| UPL-05 | Phase 2 | Pending |
| UPL-06 | Phase 2 | Pending |
| GRID-01 | Phase 3 | Pending |
| GRID-02 | Phase 3 | Pending |
| GRID-03 | Phase 3 | Pending |
| GRID-04 | Phase 3 | Pending |
| GRID-05 | Phase 3 | Pending |
| GRID-06 | Phase 3 | Pending |
| DISP-01 | Phase 4 | Pending |
| DISP-02 | Phase 4 | Pending |
| DISP-03 | Phase 4 | Pending |
| DISP-04 | Phase 4 | Pending |
| DISP-05 | Phase 4 | Pending |
| SYNC-01 | Phase 5 | Pending |
| SYNC-02 | Phase 5 | Pending |
| SYNC-03 | Phase 5 | Pending |
| SYNC-04 | Phase 5 | Pending |
| SYNC-05 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 22 total
- Mapped to phases: 22
- Unmapped: 0 ✓

---
*Requirements defined: 2026-01-26*
*Last updated: 2026-01-26 after initial definition*
