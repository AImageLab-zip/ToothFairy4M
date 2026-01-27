# Phase 02: Brain Upload - Research

**Researched:** 2026-01-27
**Domain:** Django file upload, medical imaging format handling (NIfTI), FileRegistry system
**Confidence:** HIGH

## Summary

Phase 02 implements brain MRI modality uploads through the existing maxillo upload infrastructure. The project's architecture already supports this pattern: brain modality templates exist, FileRegistry has brain file_type choices defined, and the generic file_utils functions can be reused without modification.

The upload flow mirrors maxillo exactly: dedicated upload page per patient, four input boxes (T1, T2, FLAIR, T1c), client-side extension validation, and immediate availability in FileRegistry via distinct file_type values. No processing jobs are required—files appear immediately after upload.

Key insight: The infrastructure is already 80% complete. This phase is primarily about connecting existing pieces (form handling, template rendering, modality validation) and ensuring the Job creation logic sets completed status for brain uploads (no async processing needed).

**Primary recommendation:** Use `save_generic_modality_file()` with modality slugs 'braintumor-mri-t1', 'braintumor-mri-t2', 'braintumor-mri-flair', 'braintumor-mri-t1c'. These map automatically to FileRegistry choices. No custom save functions needed.

## Standard Stack

The brain upload phase uses established components from the ToothFairy4M stack:

### Core Upload Infrastructure
| Component | Version | Purpose | Why Standard |
|-----------|---------|---------|--------------|
| Django | 4.x | Web framework, form handling | Battle-tested in maxillo upload |
| Django FileField | Built-in | File upload/storage | Standard Django pattern |
| FileRegistry model | common.models | File tracking | Already extended with brain file_type choices |
| Modality model | common.models | Dynamic modality support | Supports arbitrary slugs via ForeignKey |
| ProjectAccess | common.models | Permission model | Unified access control post-Phase-1 |

### File Processing Utilities
| Utility | Location | Purpose | When to Use |
|---------|----------|---------|-------------|
| `save_generic_modality_file()` | maxillo/file_utils.py | Single file upload with FileRegistry + Job | All brain modalities (T1, T2, FLAIR, T1c) |
| `save_generic_modality_folder()` | maxillo/file_utils.py | Folder upload (DICOM sets) | Optional DICOM folder import |
| `get_file_type_for_modality()` | maxillo/file_utils.py | Centralized file_type resolution | Determines brain_tX file_type from slug |

### HTML Templates
| Template | Purpose | Current State |
|----------|---------|----------------|
| common/upload/upload.html | Main upload page | Renders allowed_modalities dynamically |
| common/upload/modalities/braintumor-mri-t1.html | T1 input section | EXISTS — ready to use |
| common/upload/modalities/braintumor-mri-t2.html | T2 input section | EXISTS — ready to use |
| common/upload/modalities/braintumor-mri-flair.html | FLAIR input section | EXISTS — ready to use |
| common/upload/modalities/braintumor-mri-t1c.html | T1c input section | EXISTS — ready to use |

### Client-Side Validation
| Resource | Purpose | Location |
|----------|---------|----------|
| cbct_upload.js | File extension validation, upload type toggle | static/js/cbct_upload.js |
| accept attributes | Browser file picker filters | Built into modality templates |

### Installation
```bash
# No new packages needed. Stack is:
# Django (existing)
# maxillo app (existing)
# common app models (existing)
# Templates (already created in Phase 1 prep)
```

## Architecture Patterns

### Recommended Upload Flow

```
1. User navigates to /brain/patient/upload (reuses maxillo view)
   ↓
2. Template renders allowed_modalities (Brain project modalities)
   ↓
3. Four input boxes appear (T1, T2, FLAIR, T1c) via template includes
   ↓
4. Client-side validation checks .nii.gz extension on file selection
   ↓
5. User submits form (at least one modality required)
   ↓
6. View iterates through request.FILES for each modality slug
   ↓
7. Call save_generic_modality_file() for each present modality
   ↓
8. FileRegistry entries created with brain_tX file_type
   ↓
9. Job created with status='completed' (immediate availability)
   ↓
10. Redirect to patient detail page
```

### Pattern: Modality-Agnostic Upload View

**What:** Single upload_patient view handles all projects (maxillo, brain, future) by reading allowed_modalities from session project.

**When to use:** Always — this is how the current system works.

**Example:**
```python
# Source: maxillo/views/patient_upload.py
allowed_modalities = list(proj.modalities.filter(is_active=True))

# Template dynamically renders based on modality slug
{% for m in allowed_modalities %}
    {% with tpl='common/upload/modalities/'|add:m.slug|add:'.html' %}
        {% include tpl %}
    {% endwith %}
{% endfor %}
```

**Why it works for brain:** Brain modalities registered with slugs matching template filenames (braintumor-mri-t1, braintumor-mri-t2, braintumor-mri-flair, braintumor-mri-t1c) automatically render the correct input sections.

### Pattern: File Type Mapping via Centralized Function

**What:** `get_file_type_for_modality()` converts modality slug to FileRegistry file_type.

**When to use:** When calling `save_generic_modality_file()`. Let it auto-detect.

**Example:**
```python
# Source: maxillo/file_utils.py lines 24-84
file_type = get_file_type_for_modality(
    modality_slug='braintumor-mri-t1',  # maps to 'braintumor_mri_t1_raw'
    is_processed=False,
    file_format='nifti_compressed'  # .nii.gz
)
# Result: file_type = 'braintumor_mri_t1_raw' (exact match in FileRegistry.FILE_TYPE_CHOICES)
```

**Why it's reliable:** Function checks against FileRegistry.get_file_type_choices_dict().keys(), guaranteeing valid choices.

### Pattern: Immediate Availability (No Processing)

**What:** Set Job.status='completed' at upload time for image modalities.

**When to use:** Brain modalities (no async DICOM->volume conversion needed).

**Example:**
```python
# Source: maxillo/file_utils.py lines 209-226
no_processing_modalities = ['panoramic', 'teleradiography', 'intraoral-photo', 'rawzip']

if modality_slug in no_processing_modalities:
    job_obj = Job.objects.create(
        modality_slug=modality_slug,
        patient=patient,
        input_file_path=file_path,
        status='completed',  # Immediately available
        output_files={'input_format': file_format, 'file_path': file_path}
    )
    job_obj.started_at = timezone.now()
    job_obj.completed_at = timezone.now()
    job_obj.save()
```

**Update needed:** Add brain modality slugs to no_processing_modalities list. Brain uploads require status='completed' immediately.

### Anti-Patterns to Avoid

- **Custom form fields for each modality:** Don't hardcode brain fields into PatientUploadForm. The template-driven approach via allowed_modalities is more maintainable.
- **Separate file_utils functions:** Don't create save_brain_t1_file(), save_brain_t2_file(), etc. Use generic `save_generic_modality_file()` with correct slug.
- **Hardcoded file_type strings:** Don't hardcode 'brain_t1', 'brain_t2' in views. Use `get_file_type_for_modality()` or FileRegistry choices dict.
- **Processing jobs for brain:** Don't queue async jobs for brain modalities. Status should be 'completed' immediately.

## Don't Hand-Roll

Problems that have existing solutions in this codebase:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| File upload + storage | Custom file handling code | Django FileField + save_generic_modality_file() | Edge cases: permission checks, hash calculation, metadata |
| File tracking (path, hash, modality) | Custom database schema | FileRegistry model | Already supports N modalities via ForeignKey, has indexes for queries |
| File type validation | Custom validators | FileRegistry.FILE_TYPE_CHOICES + get_file_type_for_modality() | Centralized, prevents typos, auditable |
| Modality-specific templates | Switch statements in view | Template includes via modality.slug | DRY, scales to unlimited modalities |
| Job creation + status tracking | Custom status field | common.Job model | Already supports modality_slug, status transitions, dependency tracking |
| Client-side extension validation | Regex in JavaScript | Existing cbct_upload.js + template accept attributes | Already handles .nii.gz, folders, validation toggles |

**Key insight:** This codebase heavily invests in generality (FileRegistry, Modality, save_generic_modality_file). Building custom solutions creates maintenance debt. Reuse existing infrastructure.

## Common Pitfalls

### Pitfall 1: Forgetting to Add Brain Slugs to no_processing_modalities

**What goes wrong:** Brain modalities queued as pending jobs instead of completed. Patient sees "Processing..." for files that are immediately available.

**Why it happens:** Default behavior in save_generic_modality_file() is to create pending jobs. Brain uploads are immediate.

**How to avoid:** Update maxillo/file_utils.py line 210 to include brain slug variants:
```python
no_processing_modalities = [
    'panoramic',
    'teleradiography',
    'intraoral-photo',
    'rawzip',
    'braintumor-mri-t1',      # ADD THESE
    'braintumor-mri-t2',
    'braintumor-mri-flair',
    'braintumor-mri-t1c',
]
```

**Warning signs:** Test data shows Patient.files with brain modalities exists but patient_detail page shows "Processing..." spinner indefinitely.

### Pitfall 2: Modality Slug Mismatch (Template Filename ≠ Form Field Name)

**What goes wrong:** Template file not found or form doesn't capture upload.

**Why it happens:** Brain modality slugs use hyphens (braintumor-mri-t1) but Python field names need underscores.

**How to avoid:**
- Modality.slug = 'braintumor-mri-t1' (hyphens, for template filenames)
- Template: `common/upload/modalities/braintumor-mri-t1.html`
- Form input name: `braintumor-mri-t1` (matches slug, hyphens OK in HTML)
- View: `request.FILES.get('braintumor-mri-t1')` (use slug directly)

Cross-check: `get_file_type_for_modality()` line 51 does `.replace('-', '_')` when constructing file_type, so 'braintumor-mri-t1' → 'braintumor_mri_t1_raw'. This is correct and handled automatically.

**Warning signs:** 400 Bad Request on form submission, or uploaded files don't appear in patient detail.

### Pitfall 3: .nii.gz File Extension Validation Miss

**What goes wrong:** User selects .nii file instead of .nii.gz, upload succeeds, then viewer fails to load.

**Why it happens:** Client-side validation only checks extension; server-side validator doesn't exist for brain modalities.

**How to avoid:** Implement server-side validation in PatientUploadForm:
```python
def clean(self):
    cleaned_data = super().clean()
    brain_fields = ['braintumor-mri-t1', 'braintumor-mri-t2', 'braintumor-mri-flair', 'braintumor-mri-t1c']

    for field in brain_fields:
        file_obj = cleaned_data.get(field)
        if file_obj and not file_obj.name.endswith('.nii.gz'):
            raise ValidationError(f'{field} must be .nii.gz format.')
```

**Warning signs:** Test uploads of .nii (uncompressed) don't fail validation but viewer errors appear later.

### Pitfall 4: Missing Required Modality

**What goes wrong:** Form accepts submission with zero brain modalities; patient created but has no data.

**Why it happens:** Current maxillo code makes all modalities optional (required=False).

**How to avoid:** Add form-level validation:
```python
def clean(self):
    cleaned_data = super().clean()
    brain_fields = ['braintumor-mri-t1', 'braintumor-mri-t2', 'braintumor-mri-flair', 'braintumor-mri-t1c']
    has_brain = any(cleaned_data.get(f) for f in brain_fields)

    if not has_brain:
        raise ValidationError('At least one brain MRI modality is required.')
```

**Warning signs:** Patient list shows entries with no files, confusion in UI about what was uploaded.

### Pitfall 5: Forgetting Modality.objects.create() for Brain Project

**What goes wrong:** Brain project exists but has no associated modalities. Upload form shows no brain input fields.

**Why it happens:** Brain project and modalities are separate DB records. Admin needs to link them.

**How to avoid:** Add data migration or fixture that:
1. Creates/fetches Brain project
2. Creates 4 Modality records with brain slugs (if not exist)
3. Adds modalities to Brain project via ManyToMany

This likely belongs in a separate data setup task or Phase 1 verification.

**Warning signs:** Brain upload page loads but shows no file input sections.

## Code Examples

Verified patterns from official codebase:

### Example 1: Form Handling for Brain Modalities

```python
# Source: maxillo/views/patient_upload.py (adaptation for brain)
@login_required
def upload_patient(request):
    user_profile = request.user.profile

    if not user_profile.can_upload_scans():
        messages.error(request, 'You do not have permission to upload scans.')
        return redirect_with_namespace(request, 'patient_list')

    if request.method == 'POST':
        patient_upload_form = PatientUploadForm(request.POST, request.FILES, user=request.user)

        if patient_upload_form.is_valid():
            patient = patient_upload_form.save(commit=False)
            patient.uploaded_by = request.user
            patient.project = Project.objects.filter(name='Brain').first()
            patient.save()

            # Handle brain modalities
            brain_slugs = ['braintumor-mri-t1', 'braintumor-mri-t2', 'braintumor-mri-flair', 'braintumor-mri-t1c']

            for slug in brain_slugs:
                file_obj = request.FILES.get(slug)
                if file_obj:
                    try:
                        modality = Modality.objects.get(slug=slug)
                        patient.modalities.add(modality)

                        from maxillo.file_utils import save_generic_modality_file
                        fr, job = save_generic_modality_file(patient, slug, file_obj)

                        if fr:
                            messages.success(request, f'{modality.name} uploaded successfully')
                    except Exception as e:
                        messages.error(request, f'Error saving {slug}: {e}')

            messages.success(request, 'Patient uploaded successfully!')
            return redirect_with_namespace(request, 'patient_detail', patient_id=patient.patient_id)
    else:
        patient_upload_form = PatientUploadForm(user=request.user)

    return render(request, 'common/upload/upload.html', {
        'patient_upload_form': patient_upload_form,
    })
```

### Example 2: Ensuring Brain Modalities Get Immediate Availability

```python
# Source: maxillo/file_utils.py (line ~210, update needed)
# Add brain modalities to no_processing_modalities:

no_processing_modalities = [
    'panoramic',
    'teleradiography',
    'intraoral-photo',
    'rawzip',
    'braintumor-mri-t1',
    'braintumor-mri-t2',
    'braintumor-mri-flair',
    'braintumor-mri-t1c',
]

if modality_slug in no_processing_modalities:
    # Status = completed, immediately available
    job_obj = Job.objects.create(
        modality_slug=modality_slug,
        patient=patient,
        input_file_path=file_path,
        status='completed',
        output_files={'input_format': file_format, 'file_path': file_path}
    )
    job_obj.started_at = timezone.now()
    job_obj.completed_at = timezone.now()
    job_obj.save()
```

### Example 3: Form Validation for .nii.gz Format

```python
# Source: maxillo/forms.py (new clean method for PatientUploadForm)
class PatientUploadForm(forms.ModelForm):
    # ... existing fields ...

    def clean(self):
        cleaned_data = super().clean()

        # Validate brain modalities are .nii.gz
        brain_fields = {
            'braintumor-mri-t1': 'Brain MRI T1',
            'braintumor-mri-t2': 'Brain MRI T2',
            'braintumor-mri-flair': 'Brain MRI FLAIR',
            'braintumor-mri-t1c': 'Brain MRI T1c',
        }

        for field_name, display_name in brain_fields.items():
            # Note: field names with hyphens need getattr
            file_obj = cleaned_data.get(field_name)
            if file_obj and not file_obj.name.lower().endswith('.nii.gz'):
                self.add_error(
                    field_name,
                    f'{display_name} must be in .nii.gz format.'
                )

        # At least one brain modality required
        has_brain = any(
            cleaned_data.get(field)
            for field in brain_fields.keys()
        )
        if not has_brain:
            raise ValidationError('At least one brain MRI modality is required.')

        return cleaned_data
```

## State of the Art

Brain upload technology is stable. No major changes expected.

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| DICOM-only validation | Multi-format (DICOM, NIfTI, MetaImage, NRRD) | Phase 1 infrastructure | Brain modalities use .nii.gz as primary |
| Single monolithic uploader | Modality-agnostic form + template-driven UI | Phase 1 infrastructure | Same code handles maxillo, brain, future projects |
| Hardcoded file_type strings | Centralized get_file_type_for_modality() function | Phase 1 infrastructure | Prevents typos, single source of truth |

**Deprecated/outdated:**
- None identified. FileRegistry and generic utilities are current best practice.

## Open Questions

Items that could affect planning but are not blockers:

1. **Folder (DICOM) uploads for brain—scope for this phase?**
   - What we know: Templates support both "Single File" and "DICOM Folder" toggles. `save_generic_modality_folder()` exists.
   - What's unclear: CONTEXT.md specifies .nii.gz format but doesn't explicitly exclude DICOM folders. Are users expected to bring .nii.gz or raw DICOM?
   - Recommendation: CONTEXT.md says "Only .nii.gz files accepted" (singular). Assume folder upload is out of scope for Phase 02. Hide "DICOM Folder" toggle in brain templates or remove it.

2. **Replace vs. append behavior for existing modality**
   - What we know: Maxillo pattern allows multiple uploads. FileRegistry stores all.
   - What's unclear: If user uploads T1 twice, should second upload replace first or coexist?
   - Recommendation: Check CONTEXT.md "Claude's Discretion" → "Replace behavior when modality already exists". Follow maxillo pattern (multiple files coexist, UI shows latest/most recent).

3. **Patient visibility defaults for brain**
   - What we know: Patient model has visibility field (public/private/debug). Maxillo defaults to 'private' for standard users, 'debug' for student_dev.
   - What's unclear: Should brain uploads follow same pattern or differ?
   - Recommendation: Reuse maxillo logic (visibility field in form, default to 'private' for security).

## Sources

### Primary (HIGH confidence)
- **common.models.FileRegistry** — file_type choices include 'braintumor_mri_t1_raw', 'braintumor_mri_t2_raw', 'braintumor_mri_flair_raw', 'braintumor_mri_t1c_raw' (lines 420-427 of common/models.py)
- **common.models.Modality** — supports arbitrary slugs via slug field + ForeignKey design (lines 28-54)
- **maxillo/file_utils.py** — save_generic_modality_file() and get_file_type_for_modality() verified (lines 24-304)
- **maxillo/views/patient_upload.py** — upload flow pattern verified (lines 11-186)
- **Templates** — braintumor-mri-{t1,t2,flair,t1c}.html verified to exist and follow cbct.html pattern (4 files in common/upload/modalities/)

### Secondary (MEDIUM confidence)
- **maxillo/forms.py** — PatientUploadForm structure examined, ready for brain field addition (lines 19-100)
- **Phase 1 context** — Brain project and modality setup completed (inferred from template existence and FileRegistry choices)
- **Django/Project Architecture** — ProjectAccess permission model, Project.modalities ManyToMany, FileField storage patterns

### Tertiary (LOW confidence)
- None — all key components verified against live codebase.

## Metadata

**Confidence breakdown:**
- **Standard Stack:** HIGH — All libraries/components examined in live code
- **Architecture Patterns:** HIGH — Existing patterns verified (maxillo upload flow, save_generic_modality_file)
- **Pitfalls:** HIGH — Based on codebase design (missing modality setup, file type mapping, job status)
- **Code Examples:** HIGH — All examples extracted from or adapted from verified source

**Research date:** 2026-01-27
**Valid until:** 2026-02-27 (stable infrastructure, unlikely to change)

