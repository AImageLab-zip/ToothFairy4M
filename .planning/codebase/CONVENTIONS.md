# Coding Conventions

**Analysis Date:** 2026-01-26

## Naming Patterns

**Files:**
- Django app structure: `app_name/views.py`, `app_name/models.py`, `app_name/forms.py`
- View modules: `views/patient_list.py`, `views/patient_upload.py`, `views/helpers.py` (organized by feature)
- API views: `api_views/health.py`, `api_views/projects.py`, `api_views/jobs.py`
- Utility modules: `file_utils.py`, `modality_helpers.py`, `security.py`
- Template tags: `templatetags/file_utils.py`, `templatetags/pagination_tags.py`

**Functions:**
- snake_case for all functions: `get_file_type_for_modality()`, `save_generic_modality_file()`, `redirect_with_namespace()`
- Private/internal functions: prefix with underscore: `_get_patient()`, `_project_slug_from_patient()`, `_format_bytes()`
- Getter methods: `get_*` prefix: `get_ready_jobs()`, `get_dependency_jobs()`, `get_dependent_jobs()`
- Marker/state change methods: `mark_*` and `update_*`: `mark_processing()`, `mark_completed()`, `mark_failed()`, `update_status_based_on_dependencies()`
- Validation functions: `validate_*` prefix: `validate_cbct_file()`, `validate_cbct_folder()`

**Variables:**
- snake_case for all variables: `dataset_path`, `user_profile`, `patient_upload_form`
- Dictionary/mapping variables often descriptive: `job_counts`, `file_type_choices_dict`, `fallback_mappings`
- Loop variables use descriptive names: `for field_name, file_path in files_to_open`

**Types/Models:**
- PascalCase for Django models: `Patient`, `Project`, `FileRegistry`, `Job`, `ProcessingJob`, `Modality`
- Related model names: `project`, `patient`, `voice_caption`, `processing_job` (snake_case in fields)
- Status choice fields use lowercase with underscores: `'pending'`, `'processing'`, `'completed'`, `'failed'`
- Role fields: `'standard'`, `'annotator'`, `'project_manager'`, `'admin'`, `'student_dev'`

**Constants:**
- UPPERCASE_WITH_UNDERSCORES for module-level constants
- Examples: `DATASET_ROOT`, `CBCT_SLUG`, `IOS_SLUG`, `INTROARAL_PHOTO_SLUG`, `PANORAMIC_SLUG`, `TELERADIOGRAPHY_SLUG`
- Choice tuples defined inline in models

## Code Style

**Formatting:**
- No explicit formatter configured (no .flake8, .pylintrc, or pyproject.toml found)
- Django conventions followed: 4-space indentation
- Import style: standard Django organization with blank lines separating groups
- Line length: no hard limit enforced, some lines exceed 100 characters

**Linting:**
- No automated linting tools detected in codebase
- Code follows PEP 8 conventions loosely (no enforcement)
- Django and Python conventions assumed as standard

## Import Organization

**Order:**
1. Standard library imports: `import os`, `import json`, `from pathlib import Path`
2. Django imports: `from django.db import models`, `from django.contrib.auth.decorators import login_required`
3. Third-party imports: `import requests`, `import zipfile`, `import tarfile`, `import nibabel`
4. Local app imports: `from .models import Patient`, `from common.models import Project, FileRegistry`
5. Relative imports within same package: `from ..file_utils import save_generic_modality_file`

**Path Aliases:**
- No explicit path aliases (no jsconfig.json or similar)
- Relative imports use `..` for parent modules: `from ..models import Patient`
- Intra-app imports use `.` or `..`: `from .helpers import render_with_fallback`

## Error Handling

**Patterns:**
- Try/except blocks used extensively for database queries and file operations
- Generic `except Exception as e` used throughout, with logging
- Specific exceptions for known cases: `Project.DoesNotExist`, `ValidationError`
- Error details passed to logger via f-strings: `logger.error(f"Error processing: {e}")`
- Full traceback captured with `exc_info=True`: `logger.error(f"Error: {e}", exc_info=True)`
- JsonResponse used for API error responses with status codes: `JsonResponse({'error': 'Project not found'}, status=404)`
- Form validation errors exposed in API responses: `'form_errors': patient_upload_form.errors`
- File operation failures caught and logged before returning to user

**File/Path Error Handling:**
```python
# Example from health.py
try:
    pending_count = Job.objects.filter(status='pending').count()
    return JsonResponse({'success': True, ...})
except Exception as e:
    logger.error(f"Health check failed: {e}")
    return JsonResponse({'success': False, 'status': 'unhealthy', 'error': str(e)}, status=500)
```

**Validation Errors:**
```python
# Example from models.py - model validation
if not has_valid_extension:
    raise ValidationError('Unsupported file format...')
```

## Logging

**Framework:** Python's standard `logging` module

**Patterns:**
- Logger instantiated per module: `logger = logging.getLogger(__name__)`
- Four levels used: `logger.error()`, `logger.warning()`, `logger.info()`, `logger.debug()`
- Error logging with context: `logger.error(f"Error processing job for modality {modality_slug}: {e}")`
- Debug logging for detailed info: `logger.debug(f"Original URLs - upper: {upper_scan_url}, lower: {lower_scan_url}")`
- Full traceback on errors: `logger.error(f"...", exc_info=True)`
- File path logging for debugging: `logger.info(f"Audio file saved to {file_path}, processing job #{processing_job.id} created")`

**Common Log Points:**
- File save operations: `logger.info(f"... saved to {file_path}")`
- Job state transitions: `logger.error(f"Error processing job for modality {modality_slug}: {e}")`
- Database query issues: `logger.error(f"Error loading metadata: {e}")`
- File serving operations: `logger.debug(f"Serving uploaded panoramic file: {panoramic_file.file_path}")`

## Comments

**When to Comment:**
- Docstrings on all public functions (Django views, API endpoints, utilities)
- Inline comments for non-obvious logic or business rules
- Comments explaining "why" not "what" the code does

**JSDoc/TSDoc:**
- Not applicable (Python project, not JavaScript/TypeScript)
- Instead, use Python docstrings with description and parameter documentation

**Docstring Pattern:**
```python
def get_file_type_for_modality(modality_slug, is_processed=False, file_format=None, subtype=None):
    """
    Centralized function to determine the correct file_type for a given modality.

    Args:
        modality_slug: The modality slug (e.g., 'cbct', 'ios', 'braintumor-mri-t1')
        is_processed: Whether this is a processed file (adds _processed suffix)
        file_format: Optional file format hint for fallback logic
        subtype: Optional subtype (e.g., 'upper', 'lower' for IOS)

    Returns:
        str: The file_type to use in FileRegistry
    """
```

## Function Design

**Size:**
- Most functions 20-80 lines (some utilities like `save_generic_modality_file()` approach 100+ lines)
- Complex operations broken into helper functions with leading underscore
- No strict line limit enforced

**Parameters:**
- Positional parameters for required inputs: `def mark_processing(self, worker_id=None)`
- Keyword arguments for optional/configuration: `save_generic_modality_file(patient, 'cbct', cbct_file)`
- Django request passed as first parameter in view functions: `def admin_control_panel(request)`
- Self parameter in Django model methods: `def mark_completed(self, output_files=None)`

**Return Values:**
- Tuple returns for multiple values: `return file_registry, job` or `return False, error_message`
- QuerySets returned from classmethod queries: `return cls.objects.filter(status='pending')`
- JsonResponse for API endpoints: `return JsonResponse({'success': True, ...})`
- Django HttpResponse/redirect for views: `return redirect('patient_list')`
- None for side-effect-only functions: methods that save/update objects
- Optional returns: `get_processing_duration()` returns `None` if data incomplete

## Module Design

**Exports:**
- All public functions available for import (no __all__ lists found)
- Views export individual view functions: `from .patient_upload import upload_patient`
- Models export model classes directly: `from .models import Patient, Project`
- Utilities export helper functions: `from .file_utils import save_generic_modality_file`

**Barrel Files:**
- `__init__.py` files exist but mostly empty or minimal
- App initialization in `apps.py`: `class MaxilloConfig(AppConfig): name = 'maxillo'`
- No barrel index files consolidating exports

**Organization Examples:**
- `maxillo/views/` - Split by feature: `patient_upload.py`, `patient_list.py`, `patient_detail.py`, `voice_captions.py`, `admin.py`
- `maxillo/api_views/` - Split by feature: `health.py`, `projects.py`, `jobs.py`, `files.py`
- `common/` - Shared models, views, context processors
- `brain/` - Brain tumor project app (parallel to maxillo)

## Model Design Patterns

**Model Methods:**
- Methods like `is_valid()`, `can_retry()`, `is_cbct_processed()` return booleans for state checks
- Methods like `mark_processing()`, `mark_completed()` update state and call `save()`
- Methods like `get_processing_duration()` calculate derived values
- Methods like `check_dependencies()` perform validation without side effects
- Classmethods for queries: `Job.get_ready_jobs()` returns `cls.objects.filter(...)`

**Meta Classes:**
- Consistent use of `ordering` and `indexes` in Meta: `ordering = ['-priority', 'created_at']`
- Database table specification: `db_table = 'scans_job'` (mapping to legacy table names)
- Unique constraints: `unique_together = ('user', 'project')`

---

*Convention analysis: 2026-01-26*
