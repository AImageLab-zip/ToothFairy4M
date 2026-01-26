# Codebase Structure

**Analysis Date:** 2026-01-26

## Directory Layout

```
ToothFairy4M-dev/
├── toothfairy/              # Django project config (settings, URLs, middleware)
│   ├── settings.py          # Database, logging, apps, middleware, security
│   ├── urls.py              # Root URL router
│   ├── wsgi.py              # WSGI application entry point
│   ├── asgi.py              # ASGI entry point
│   └── middleware.py        # Custom middleware (request logging, profile resolution)
│
├── maxillo/                 # Main Django app (CBCT scans, medical imaging)
│   ├── models.py            # Patient, Classification, FileRegistry, Dataset, Folder, Tag
│   ├── admin.py             # Django admin customization
│   ├── forms.py             # ModelForms for patient upload, management
│   ├── apps.py              # App config + signals registration
│   ├── signals.py           # Auto-create user profiles on User creation
│   ├── file_utils.py        # File processing utilities, job submission
│   ├── modality_helpers.py  # Modality-specific helper functions
│   ├── modality_processing_handlers.py  # Handle job outputs by modality
│   ├── security.py          # Security utilities
│   │
│   ├── views/               # Function-based views organized by feature
│   │   ├── __init__.py      # Barrel exports (re-exports all views)
│   │   ├── patient_list.py  # home(), select_project(), patient_list()
│   │   ├── patient_detail.py # patient_detail(), update_patient_name()
│   │   ├── patient_upload.py # upload_patient()
│   │   ├── patient_data.py  # API endpoints: patient_cbct_data(), patient_panoramic_data(), etc.
│   │   ├── classification.py # update_classification()
│   │   ├── deletion.py       # delete_patient(), bulk_delete_patients()
│   │   ├── folders_tags.py  # create_folder(), add_patient_tag(), move_patients_to_folder()
│   │   ├── voice_captions.py # upload_voice_caption(), delete_voice_caption(), etc.
│   │   ├── metadata.py       # get_nifti_metadata(), update_nifti_metadata()
│   │   ├── export.py         # export_list(), export_new(), export_preview(), export_status(), download, delete
│   │   ├── admin.py          # rerun_processing(), admin_control_panel()
│   │   ├── profile.py        # user_profile()
│   │   ├── auth.py           # register(), invitation_list(), delete_invitation()
│   │   └── helpers.py        # render_with_fallback(), redirect_with_namespace()
│   │
│   ├── api_views/           # API endpoints for Docker containers + JavaScript
│   │   ├── __init__.py      # Barrel exports
│   │   ├── jobs.py          # get_pending_jobs(), mark_job_processing(), mark_job_completed_api()
│   │   ├── files.py         # get_file_registry(), serve_file()
│   │   ├── projects.py      # project_upload_api(), get_project_folders(), project_patients_handler()
│   │   └── health.py        # health_check()
│   │
│   ├── utils/               # Utility modules
│   │   ├── __init__.py
│   │   └── export_processor.py # ExportProcessor class for generating export zips
│   │
│   ├── management/          # Django management commands
│   │   ├── commands/
│   │   │   ├── create_image_modalities.py
│   │   │   └── change_patient_id.py
│   │   └── __init__.py
│   │
│   ├── migrations/          # Database migrations
│   │
│   ├── app_urls.py          # App-specific URL patterns (patient routes, export routes)
│   ├── api_urls.py          # API URL patterns (job, file, project endpoints)
│   └── urls.py              # (Empty or deprecated, app_urls.py is primary)
│
├── brain/                   # Brain imaging app (reuses maxillo views via URL namespace)
│   ├── models.py            # BrainUserProfile (OneToOne with User)
│   ├── admin.py             # Admin registration
│   ├── apps.py              # App config
│   ├── urls.py              # Routes to maxillo views with 'brain' namespace
│   └── migrations/
│
├── common/                  # Shared models and utilities
│   ├── models.py            # Project, Modality, ProjectAccess, Invitation, Job, ProcessingJob, FileRegistry
│   ├── views.py             # admin_control_panel() - app-agnostic admin dashboard
│   ├── context_processors.py # current_project context variable for templates
│   ├── templatetags/        # Custom template filters/tags
│   ├── migrations/          # Database migrations
│   └── apps.py              # App config
│
├── templates/               # HTML templates
│   ├── base.html            # Base template with navigation
│   ├── registration/        # Login/logout templates
│   ├── common/              # Shared templates
│   │   ├── landing.html     # Project selection
│   │   ├── admin_control_panel.html
│   │   ├── partials/        # Reusable components
│   │   ├── sections/        # Page sections
│   │   └── upload/          # Upload form templates
│   ├── maxillo/             # App-specific templates
│   │   └── (patient list, detail, export pages)
│   ├── brain/               # Brain app templates (minimal, reuses maxillo)
│   └── scans/               # Legacy templates (deprecated)
│
├── static/                  # CSS, JavaScript, assets
│   ├── css/                 # Stylesheets
│   ├── js/                  # Frontend JavaScript
│   │   └── modality_viewers/ # 3D viewers for CBCT, panoramic, etc.
│   └── shaders/             # WebGL shader files
│
├── storage/                 # Media files directory (generated at runtime)
│   └── scans/patient_X/     # Organized by patient ID
│       ├── raw/             # Original uploaded files
│       ├── normalized/      # Processed STL files
│       ├── cbct/            # CBCT volumes
│       └── voice_captions/  # Audio files
│
├── logs/                    # Application logs (generated at runtime)
│   └── django.log           # Main application log
│
├── .planning/               # GSD planning output
│   └── codebase/            # Architecture documents
│
├── manage.py                # Django CLI entry point
├── requirements.txt         # Python dependencies
├── docker-compose.yml       # Docker services definition
├── Dockerfile               # Docker image build config
├── entrypoint.sh            # Container startup script
├── nginx.conf               # Nginx reverse proxy config
└── .env                     # Environment variables (secrets)
```

## Directory Purposes

**toothfairy/ (Django Project):**
- Purpose: Core Django project configuration
- Contains: Settings (database, apps, security), URL routing, WSGI/ASGI entry points, middleware
- Key files: `settings.py`, `urls.py`, `middleware.py`

**maxillo/ (Primary Django App):**
- Purpose: Main application for CBCT/medical imaging data management
- Contains: Models (Patient, Classification), views (patient detail/list/upload/export), API endpoints, file utilities
- Structure: Views organized by feature (patient_list, patient_detail, export, etc.) with __init__.py barrel exports
- API layer: Separate `api_views/` directory for JSON endpoints

**brain/ (Secondary Django App):**
- Purpose: Brain imaging project (shares data model with maxillo via URL namespace)
- Contains: BrainUserProfile model, URL routing to maxillo views with 'brain' namespace
- Note: Reuses maxillo's templates and views but with different user permissions

**common/ (Shared Models):**
- Purpose: Cross-app models and utilities
- Contains: Project, Modality, ProjectAccess, Job, ProcessingJob, FileRegistry
- Used by: maxillo, brain, and management commands

**templates/ (HTML):**
- Purpose: Django templates organized by app
- Structure: base.html, then app-specific dirs (maxillo/, brain/), plus common/ for shared components
- Rendering: Views use render_with_fallback() to support both app-specific and common templates

**static/ (Frontend Assets):**
- Purpose: CSS, JavaScript, WebGL shaders
- Structure: css/, js/ (with modality_viewers/ for 3D visualization)
- Served by: Django in development (DEBUG=True), Nginx in production

**storage/ (Media Root):**
- Purpose: Uploaded patient files (generated at runtime, not committed)
- Structure: scans/patient_X/raw/, normalized/, cbct/, voice_captions/
- Managed by: Django FileField, ExportProcessor

## Key File Locations

**Entry Points:**
- `manage.py`: Django management CLI
- `toothfairy/wsgi.py`: Production WSGI application
- `toothfairy/urls.py`: Root URL router

**Configuration:**
- `toothfairy/settings.py`: Database, logging, installed apps, middleware, security settings
- `requirements.txt`: Python package dependencies
- `.env`: Environment variables (not committed)

**Models:**
- `maxillo/models.py`: Patient, Classification, VoiceCaption, MaxilloUserProfile, Dataset, Folder, Tag, Export
- `common/models.py`: Project, Modality, ProjectAccess, Invitation, Job, ProcessingJob, FileRegistry
- `brain/models.py`: BrainUserProfile

**Core Views:**
- `maxillo/views/patient_list.py`: home(), select_project(), patient_list()
- `maxillo/views/patient_detail.py`: patient_detail(), update_patient_name()
- `maxillo/views/patient_upload.py`: upload_patient()
- `maxillo/views/export.py`: export_list(), export_new(), export_preview(), export_status(), export_download(), export_delete()

**API Endpoints:**
- `maxillo/api_views/jobs.py`: get_pending_jobs(job_type), mark_job_processing(), mark_job_completed_api()
- `maxillo/api_views/files.py`: get_file_registry(), serve_file()
- `maxillo/api_views/projects.py`: project_upload_api(), project_patients_handler()

**Utilities:**
- `maxillo/file_utils.py`: Job submission, file processing, DICOM validation
- `maxillo/utils/export_processor.py`: ExportProcessor class for export generation
- `common/views.py`: admin_control_panel()

**Middleware:**
- `toothfairy/middleware.py`: RequestLoggingMiddleware, ProjectSessionMiddleware, ActiveProfileMiddleware

## Naming Conventions

**Files:**
- Views: lowercase_with_underscores.py (e.g., `patient_list.py`, `patient_detail.py`)
- Models: Capitalized class names in models.py (e.g., `Patient`, `Classification`)
- API endpoints: named per functionality (e.g., `get_pending_jobs`, `mark_job_completed_api`)
- Templates: lowercase/hyphenated (e.g., `patient_detail.html`, `admin_control_panel.html`)

**Directories:**
- App modules: lowercase (maxillo, brain, common)
- Feature subdirectories: descriptive plural (views/, api_views/, migrations/)
- URL patterns: kebab-case (e.g., `/patient/<id>/voice-caption/`, `/export/preview/`)

**Database Tables:**
- Legacy: `scans_*` prefix (from earlier migration history)
- Models: Django auto-generates table names from app + model name (overrideable via Meta.db_table)

**Functions & Classes:**
- View functions: lowercase_with_underscores (e.g., `patient_detail(request)`)
- Class-based views: CamelCase ending in View (e.g., `ProcessingJobListView`)
- Model classes: CamelCase (e.g., `Patient`, `Classification`, `MaxilloUserProfile`)
- Helper functions: descriptive lowercase (e.g., `get_cbct_raw_file()`, `validate_cbct_file()`)

## Where to Add New Code

**New Feature (Patient-related):**
- Primary code: Add function to appropriate file in `maxillo/views/` (or create new file)
- Template: `templates/maxillo/feature_name.html` or `templates/common/` if shared
- Tests: Create `maxillo/test_feature_name.py` (if tests exist; currently minimal test coverage)
- URL pattern: Add to `maxillo/app_urls.py`

**New API Endpoint:**
- Implementation: Create function in appropriate file in `maxillo/api_views/`
- URL pattern: Add to `maxillo/api_urls.py` (namespace as 'api')
- Middleware handling: If needs project context, use ActiveProfileMiddleware-set `request.user.profile`

**New Component/Module:**
- Implementation: Create file in appropriate directory (e.g., `maxillo/utils/new_utility.py`)
- Import: Add to module's `__init__.py` for barrel export if part of public API
- Usage: Import from barrel or directly from module

**Utilities & Helpers:**
- Shared across apps: Place in `common/` (models.py or new utils file)
- App-specific: Place in `maxillo/` (file_utils.py or new utils submodule)
- Job processing: Use `maxillo/utils/` for export processors, modality handlers

**Model Changes:**
- Add field: Edit `maxillo/models.py`, `common/models.py`, or `brain/models.py`
- Create migration: Run `python manage.py makemigrations`
- Update: View code that references model, forms, admin registration

**Template Changes:**
- App-specific: Edit `templates/maxillo/` or `templates/brain/`
- Shared UI: Edit `templates/common/` or `templates/base.html`
- Includes: Use Django {% include %} for reusable snippets in `templates/common/partials/`

## Special Directories

**migrations/:**
- Purpose: Database migration history
- Generated: Yes (by `python manage.py makemigrations`)
- Committed: Yes (version control important for reproducibility)
- Location: Each app has `app_name/migrations/`
- Note: Do not edit by hand; Django ORM manages these

**storage/:**
- Purpose: Media file uploads (patient scans, exports, voice captions)
- Generated: Yes (at runtime via FileField upload)
- Committed: No (excluded by .gitignore)
- Location: Configurable via MEDIA_ROOT setting (default `/storage/`)
- Structure: `scans/patient_<id>/raw/`, `normalized/`, `cbct/`, `voice_captions/`

**logs/:**
- Purpose: Application runtime logs
- Generated: Yes (by logging handlers)
- Committed: No (excluded by .gitignore)
- Location: `logs/django.log`
- Config: Configured in `toothfairy/settings.py` LOGGING dict

**staticfiles/ (generated):**
- Purpose: Collected static files for production
- Generated: Yes (by `python manage.py collectstatic`)
- Committed: No (excluded by .gitignore)
- Location: `staticfiles/` (configured via STATIC_ROOT)
- Note: Only relevant in production; development serves from `static/` directly

**.planning/:**
- Purpose: GSD planning documents and analysis
- Generated: Yes (by GSD tools)
- Committed: Yes (part of planning workflow)
- Location: `.planning/codebase/` contains ARCHITECTURE.md, STRUCTURE.md, etc.

---

*Structure analysis: 2026-01-26*
