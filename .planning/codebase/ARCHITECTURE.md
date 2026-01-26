# Architecture

**Analysis Date:** 2026-01-26

## Pattern Overview

**Overall:** Multi-App Django Project with Task Queue Pattern (Job/Processing Queue)

**Key Characteristics:**
- Multi-tenant architecture with per-project user profiles (`maxillo_profile`, `brain_profile`)
- Modular apps (`maxillo`, `brain`, `common`) with shared models and middleware
- Request middleware stack that auto-selects user profile based on app namespace
- Asynchronous job processing system for medical imaging and file conversion tasks
- RESTful API layer alongside template-based web interface

## Layers

**Middleware & Request Handling:**
- Purpose: Request interception, logging, user profile resolution, project session management
- Location: `toothfairy/middleware.py`
- Contains: `RequestLoggingMiddleware`, `ProjectSessionMiddleware`, `ActiveProfileMiddleware`
- Depends on: User models, Project/Profile models
- Used by: All incoming requests to determine execution context

**View Layer (Web UI):**
- Purpose: HTML page rendering and form handling for users
- Location: `maxillo/views/`, `brain/` (reuses maxillo views via URL namespace)
- Contains: Function-based views organized by feature (patient_list, patient_detail, export, etc.)
- Depends on: Models, Forms, Helper functions, Templates
- Used by: Browser requests from authenticated users
- Pattern: Feature-based organization with `__init__.py` barrel exports

**API Layer (JSON):**
- Purpose: JSON endpoints for external services (Docker processing containers, JavaScript frontends)
- Location: `maxillo/api_views/`
- Contains: CSRF-exempt endpoints for job management, file serving, project operations
- Depends on: Models, file utilities, job processing handlers
- Used by: Docker containers polling for jobs, JavaScript AJAX calls
- Authentication: Cookie-based for web clients, custom headers for Docker containers (via `/api/` namespace)

**Data Layer:**
- Purpose: ORM models for database entities
- Location: `maxillo/models.py`, `common/models.py`, `brain/models.py`
- Contains: Patient, Classification, Job, ProcessingJob, FileRegistry, User Profiles, Project, Modality
- Depends on: Django ORM, validators
- Used by: All views and API handlers

**Utility & Business Logic:**
- Purpose: File handling, job orchestration, export processing
- Location: `maxillo/file_utils.py`, `maxillo/utils/export_processor.py`, `maxillo/modality_processing_handlers.py`
- Contains: Job submission, file registry lookups, DICOM validation, export generation
- Depends on: Models, external libraries (zipfile, tarfile, logging)
- Used by: Views, API handlers, signals

**Shared Services (Common App):**
- Purpose: Cross-app utilities and models
- Location: `common/models.py`, `common/views.py`, `common/context_processors.py`
- Contains: Project, Modality, ProjectAccess, Job, ProcessingJob models; admin control panel
- Depends on: Django models, signals from maxillo/brain
- Used by: All apps via import

## Data Flow

**Patient Upload Flow:**

1. User submits form at `/maxillo/upload/` (web) or `/api/maxillo/upload/` (API)
2. `patient_upload` view validates file (DICOM, STL, etc.) via `validate_cbct_file()` or folder validation
3. Patient and FileRegistry records created; raw files stored in `/dataset/scans/patient_X/raw/`
4. Job records created with status='pending' for each modality requiring processing
5. Docker container polls `/api/processing/jobs/pending/<job_type>/` for pending jobs
6. Container processes files, uploads outputs to `/api/processing/files/serve/<file_id>/`
7. Job marked complete via `/api/processing/jobs/<job_id>/completed/` → status='completed'
8. Dependent jobs (if any) automatically transitioned from 'dependency' to 'pending'

**Patient Viewing Flow:**

1. User navigates to `/maxillo/patients/<patient_id>/` (web view)
2. `patient_detail` view checks user permissions via `user.profile.is_admin()`, `is_annotator()`, etc.
3. View queries Patient model + related Classifications, VoiceCaptions, FileRegistry entries
4. JavaScript calls `/api/patient/<patient_id>/cbct/`, `/api/patient/<patient_id>/panoramic/` etc.
5. API endpoints serve file paths from FileRegistry
6. 3D viewer (Three.js + medical viewers) renders DICOM/NIfTI files client-side

**Project Selection Flow:**

1. Unauthenticated users → `home` view shows landing page
2. Authenticated users → `home` view lists accessible projects (filtered by ProjectAccess)
3. User clicks project → `select_project` view sets `request.session['current_project_id']`
4. Subsequent requests processed by `ProjectSessionMiddleware` (sets if missing)
5. `ActiveProfileMiddleware` detects app namespace (maxillo/brain) and attaches correct profile to `request.user.profile`
6. View code uses `request.user.profile` polymorphically (both MaxilloUserProfile and BrainUserProfile)

**Export Flow:**

1. User creates export via `/maxillo/export/new/` → creates Export record with status='pending'
2. Background processor (or signal) invokes `ExportProcessor` (in `maxillo/utils/export_processor.py`)
3. Processor queries patients by filters, zips data, uploads to storage
4. Export record updated with file path and status='completed'
5. User downloads via `/maxillo/export/<export_id>/download/` → serves Export.file

## State Management

**Session State:**
- `request.session['current_project_id']` - tracks active project per user
- Django's built-in session table stores other authenticated state

**Model State:**
- Job status machine: pending → processing → completed OR pending → retrying → failed
- ProcessingJob status machine: pending → processing → completed/failed/retrying
- Patient visibility: public, private, debug (affects permission checks in views)
- User roles: standard, annotator, project_manager, admin, student_dev (checked via profile methods)

**Cache & Transient State:**
- `request.user.profile` dynamically set by middleware (points to MaxilloUserProfile or BrainUserProfile)
- File paths computed at request time via `FileRegistry.file_path` property

## Key Abstractions

**User Profile Pattern:**
- Purpose: Per-project user role and permission model
- Examples: `MaxilloUserProfile`, `BrainUserProfile` (both OneToOneField to User)
- Pattern: Dynamic profile attachment via middleware; views access via `request.user.profile`
- Allows app-specific permissions (e.g., student_dev can only see 'debug' patients in Brain)

**Job/Processing Job Abstraction:**
- Purpose: Decouple request-response cycle from long-running tasks
- Examples: Job (generic), ProcessingJob (Docker-specific)
- Pattern: Status tracking + output file mapping; dependency resolution
- Methods: `mark_processing()`, `mark_completed()`, `check_dependencies()`, `notify_dependents()`

**FileRegistry:**
- Purpose: Track physical files on disk without duplicating file storage
- Pattern: Stores {patient, modality, file_path, file_type}, retrieved by views/API
- Avoids direct filesystem navigation; provides single source of truth

**Project & Modality:**
- Purpose: Multi-tenant workspaces + extensible imaging modes
- Pattern: Project contains Users (via ProjectAccess), Modalities (ManyToMany); Patient belongs to Project
- Allows different projects to have different modalities + permission matrices

## Entry Points

**Web Application Entry:**
- Location: `toothfairy/wsgi.py`
- Triggers: HTTP requests to Django
- Responsibilities: Instantiate Django WSGI app; ASGI variant in `toothfairy/asgi.py` for async

**URL Router Entry:**
- Location: `toothfairy/urls.py`
- Routes: `/`, `/maxillo/`, `/brain/`, `/api/`, `/admin/`, `/login/`, `/register/`
- Includes: `maxillo.app_urls`, `maxillo.api_urls` (namespaced for view/api distinction)

**API Entry Points:**
- Health: `GET /api/processing/health/` → `health_check()` - Docker container heartbeat
- Jobs: `GET /api/processing/jobs/pending/<job_type>/` → `get_pending_jobs(job_type)` - job queue fetch
- Files: `GET /api/processing/files/` → `get_file_registry()` - file list query
- Completion: `POST /api/processing/jobs/<job_id>/completed/` → `mark_job_completed_api()` - result submission

**Management Command Entry:**
- Location: `maxillo/management/commands/`
- Examples: `create_image_modalities.py`, `change_patient_id.py`
- Invoked: `python manage.py <command>`

**Signal Handlers:**
- Location: `maxillo/signals.py`
- Triggers: User creation, MaxilloUserProfile creation/update
- Responsibilities: Auto-create MaxilloUserProfile, sync is_staff flag, grant permissions

## Error Handling

**Strategy:** Defensive middleware + per-layer exception handling

**Patterns:**
- Middleware catches exceptions in `process_exception()` → logs with traceback, returns None (allows Django error handler)
- Views use try-except for file operations, query failures → render error template or redirect with messages
- API endpoints catch all exceptions → return `JsonResponse({'error': str(e)})` with 500 status
- Models validate via Django validators (FileExtensionValidator, custom validate_cbct_file)
- Job system tracks retry count + max_retries; failed jobs can be manually rerun via admin

## Cross-Cutting Concerns

**Logging:**
- Framework: Python logging module
- Config: `toothfairy/settings.py` LOGGING dict
- Loggers: 'django', 'django.request', 'maxillo', 'toothfairy.middleware'
- Output: Console + file (`logs/django.log`)

**Validation:**
- File uploads: `validate_cbct_file()` checks extensions + archive contents (DICOM in zip/tar)
- Folder uploads: `validate_cbct_folder()` ensures .dcm or DICOMDIR present
- Forms: Django ModelForms auto-validate via Meta.fields + custom clean methods

**Authentication:**
- Framework: Django's built-in User + session middleware
- Profile-based RBAC via `request.user.profile.is_admin()`, `is_annotator()`, etc.
- Decorators: `@login_required`, `@user_passes_test(lambda u: u.profile.is_admin)`
- Middleware: Blocks unauthenticated requests by returning None (allows Django to handle)

**Security:**
- CSRF: Enabled by default; exempt on API endpoints via `@csrf_exempt`
- CORS: Configured via settings; API endpoints allow cross-origin requests
- SSL: Conditional based on ENABLE_SSL flag; HSTS headers, secure cookies if enabled
- Permissions: Row-level via Patient.visibility, Project.access_list; column-level via role checks

---

*Architecture analysis: 2026-01-26*
