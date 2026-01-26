# ToothFairy4M

## What This Is

A medical imaging platform for managing and visualizing patient CBCT scans and MRI volumes. Currently supports maxillofacial imaging (Maxillo project) with CBCT, IOS, panoramic, and other modalities. Adding Brain MRI visualization with a specialized multi-window viewer for radiologists.

## Core Value

Clinicians can quickly visualize and compare multiple MRI modalities side-by-side with synchronized navigation, enabling efficient diagnostic workflows.

## Requirements

### Validated

- User authentication with Django built-in auth — existing
- Multi-project architecture (Maxillo, Brain) with project selection — existing
- Patient upload with file validation (DICOM, NIfTI, STL) — existing
- FileRegistry tracking all uploaded files by patient/modality — existing
- Job/ProcessingJob system for async file processing — existing
- Maxillo viewer with tabbed modality display — existing
- Export functionality for administrators — existing
- Role-based permissions (admin, annotator, project_manager, standard, student_dev) — existing

### Active

- [ ] Consolidate UserProfile models into ProjectAccess with roles
- [ ] Remove can_view/can_upload fields from ProjectAccess (roles handle this)
- [ ] Clean up duplicate permission checking across codebase
- [ ] Brain upload flow for T1/T2/FLAIR/T1c modalities (check current state)
- [ ] Brain viewer: 2x2 grid of windows, starting empty
- [ ] Brain viewer: Drag-drop modalities into windows
- [ ] Brain viewer: Per-window Axial/Sagittal/Coronal view toggle
- [ ] Brain viewer: Synchronized scrolling between windows
- [ ] Brain viewer: "Free Scroll" toggle to break sync per window
- [ ] Brain viewer: Fast volume loading with caching

### Out of Scope

- Crosshair reference lines with click-to-navigate — deferred to v2
- Real-time collaboration features — not needed for v1
- Mobile app — web-first approach
- Video/streaming of volumes — static slice navigation sufficient

## Context

**Existing architecture:**
- Django 5.2.4 with MySQL 8.0 backend
- Apps: `common` (shared models), `maxillo` (maxillofacial imaging), `brain` (MRI imaging)
- Current dual permission system: `MaxilloUserProfile`/`BrainUserProfile` + `ProjectAccess`
- nibabel for NIfTI file handling, Three.js for 3D visualization
- Docker-based deployment with nginx reverse proxy

**Known issues to address:**
- Duplicate UserProfile models with identical role logic
- Permission checks scattered and inconsistent
- Brain project partially implemented but viewer not functional

**Target users:**
- Radiologists and clinicians viewing brain MRI data
- Researchers managing patient imaging datasets

## Constraints

- **Tech stack**: Must use existing Django/MySQL/nibabel stack — investment in current infrastructure
- **Browser**: Must work in modern browsers (Chrome, Firefox, Safari) — no native app
- **Performance**: Volume loading must be non-blocking — clinicians can't wait for large files
- **Data format**: Brain modalities are NIfTI (.nii.gz) format — standard for MRI

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Refactor before new features | Clean permission model prevents bugs in new code | — Pending |
| 2x2 grid (not larger) | Matches 4 modalities, keeps UI manageable | — Pending |
| Cache volumes on first load | Enables fast drag-drop without re-loading | — Pending |
| Synchronized scrolling as default | Clinical workflow expects registered views | — Pending |

---
*Last updated: 2026-01-26 after initialization*
