# External Integrations

**Analysis Date:** 2026-01-26

## APIs & External Services

**Medical Imaging Processing:**
- No external processing API integrated. Processing jobs are managed internally via polling mechanism.
  - Job queue system in `common.models.Job` with status tracking
  - Internal API endpoints handle job lifecycle (pending → processing → completed/failed)
  - Polling interval configured via `POLL_INTERVAL` env var (default: 60 seconds)

**Processing Worker API:**
- Internal API endpoint: `/api/processing/jobs/` endpoints
  - `GET /api/processing/jobs/pending/<job_type>/` - Workers fetch pending jobs by type
  - `POST /api/processing/jobs/<job_id>/processing/` - Mark job as processing
  - `POST /api/processing/jobs/<job_id>/completed/` - Report job completion with output files
  - `POST /api/processing/jobs/<job_id>/failed/` - Report job failure with error logs
  - Implementation: `maxillo/api_views/jobs.py`

**File Serving:**
- Internal file API: `/api/processing/files/serve/<file_id>/`
  - Serves medical imaging files from filesystem
  - Implementation: `maxillo/api_views/files.py`

**Project-Based APIs:**
- `/api/<project_slug>/upload/` - File upload endpoint for specific projects
- `/api/<project_slug>/patients/` - Patient data retrieval (GET) and bulk retrieval (POST)
- `/api/<project_slug>/patients/<patient_id>/files/` - Individual patient file listings
- Implementation: `maxillo/api_views/projects.py`

**Health Check:**
- `GET /api/processing/health/` - System health endpoint
  - Checks database connectivity, pending/processing job counts, dataset directory structure
  - Implementation: `maxillo/api_views/health.py`

## Data Storage

**Databases:**
- MySQL 8.0 - Primary data store
  - Connection config: `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_PORT` (env vars)
  - Database name: `toothfairy` (configured in `DB_NAME`)
  - Client: `mysqlclient` (Python MySQL adapter)
  - ORM: Django ORM
  - Key models in `common/models.py`: Project, Modality, Job, FileRegistry, Invitation
  - Key models in `maxillo/models.py`: Patient, VoiceCaption, Classification, Dataset
  - Key models in `brain/models.py`: BrainUserProfile

**File Storage:**
- Local filesystem only
  - Dataset root: `/dataset` (configurable via `DATASET_PATH`)
  - Structure:
    - `/dataset/brain/raw/` - Raw brain MRI data (FLAIR, T1, T1c, T2, CBCT)
    - `/dataset/brain/processed/` - Processed brain imaging outputs
    - `/dataset/maxillo/raw/` - Raw maxillo datasets (audio, bite, CBCT, intraoral, iOS, panoramic, teleradiography)
    - `/dataset/maxillo/processed/` - Processed maxillo datasets
    - `/dataset/exports/` - Export outputs for administrators
  - Supported formats: DICOM (.dcm), NIfTI (.nii, .nii.gz), MetaImage (.mha, .mhd), NRRD (.nrrd, .nhdr), ZIP/TAR archives
  - File registry model: `common.models.FileRegistry` tracks all uploaded files with metadata

**Caching:**
- None detected

**Logging:**
- File-based logging
  - Log file: `/logs/django.log` (created in `BASE_DIR / 'logs'`)
  - Console and file handlers configured in `LOGGING` section of `toothfairy/settings.py`
  - Log levels: DEBUG for application loggers, INFO for Django framework in production

## Authentication & Identity

**Auth Provider:**
- Django's built-in authentication
  - Implementation: `django.contrib.auth` (Django admin, LoginView, LogoutView)
  - User model: Django's default User model with extended profiles
  - URL routes: `/login/`, `/logout/`, `/register/`

**User Profiles:**
- Per-app user profiles (multi-project user support):
  - `MaxilloUserProfile` in `maxillo/models.py` - Role-based access for maxillo project
  - `BrainUserProfile` in `brain/models.py` - Role-based access for brain project
  - Role choices: standard, annotator, project_manager, admin, student_dev
  - Auto-created via Django signals (`maxillo/signals.py`) when User is created

**Access Control:**
- Project-based access: `common.models.ProjectAccess` defines per-user, per-project permissions
- Security checks: `maxillo/security.py` with functions:
  - `check_patient_access()` - Verify user can view/modify specific patient data
  - `check_project_access()` - Verify user has project access
  - `check_file_access()` - Verify user can access specific file
- Permission decorators: `@login_required`, `@user_passes_test()` in views

**Invitation System:**
- Invitation-based user onboarding: `common.models.Invitation`
  - Generated invite codes with expiration
  - Role assignment at invitation time
  - Project-specific invitations
  - Routes: `/invitations/` (list), `/invitations/<code>/delete/` (admin delete)
  - Implementation: `maxillo/views/auth.py`

## Monitoring & Observability

**Error Tracking:**
- None detected (no Sentry, Rollbar, or similar integration)
- Error handling: Django default error pages in development, custom error logs in production

**Logs:**
- Approach: File and console logging via Python's logging module
  - Detailed format: `[{asctime}] {levelname} {name} {funcName}:{lineno} - {message}`
  - Log handlers configured for: Django core, request/server logs, app-specific (maxillo, toothfairy, middleware)
  - Config location: `toothfairy/settings.py` lines 217-301

## CI/CD & Deployment

**Hosting:**
- Docker container deployment
- Environment: On-premises or cloud with Docker/Docker Compose support
- Reverse proxy setup: nginx with Let's Encrypt (mentioned in `nginx.conf`)
- External network: `proxy-net` for reverse proxy communication

**CI Pipeline:**
- None detected (no GitHub Actions, GitLab CI, Jenkins configuration)

**Deployment Artifacts:**
- Docker image built from `Dockerfile`
- Container orchestration via `docker-compose.yml`
- Entrypoint: `entrypoint.sh` - Runs Django migrations and starts development server

## Environment Configuration

**Required env vars (Critical):**
- `SECRET_KEY` - Django secret key
- `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT` - MySQL credentials
- `DEBUG` - Debug mode toggle
- `ALLOWED_HOSTS` - Comma-separated allowed hostnames
- `DATASET_PATH` - Path to medical dataset storage
- `DOMAIN` - Public domain name
- `LETSENCRYPT_EMAIL` - Email for certificate registration

**Optional env vars (Configuration):**
- `ENABLE_SSL`, `ENABLE_HTTPS_REDIRECT` - HTTPS settings
- `CSRF_TRUSTED_ORIGINS` - Trusted origin domains (default includes specific URLs)
- `CORS_ALLOWED_ORIGINS` - CORS-allowed origins
- `LOG_LEVEL` - Logging level (DEBUG/INFO/WARNING)
- `POLL_INTERVAL` - Worker job polling interval in seconds (default: 60)
- `DOCKER_SUFFIX`, `WEB_EXTERNAL_PORT`, `DB_EXTERNAL_PORT` - Docker Compose configuration

**Secrets location:**
- `.env` file at project root (development)
- Environment variables passed to Docker containers
- File is git-ignored (in `.gitignore`)

## Webhooks & Callbacks

**Incoming:**
- None detected. No webhook endpoints for external integrations.

**Outgoing:**
- None detected. No calls to external webhook services.

**Internal Job Callbacks:**
- Job status callbacks via API (processing worker reports completion/failure to Django)
- Implementation: Workers POST to `/api/processing/jobs/<job_id>/completed/` or `/api/processing/jobs/<job_id>/failed/`

## Data Exchange Formats

**Supported Input Formats:**
- DICOM (.dcm files, DICOMDIR, ZIP/TAR archives containing DICOM)
- NIfTI (.nii, .nii.gz) for brain imaging
- MetaImage (.mha, .mhd)
- NRRD (.nrrd, .nhdr)
- Archive formats: .zip, .tar, .tar.gz, .tgz
- Images: .jpg, .png (via Pillow)
- Audio: .wav, .mp3, .aac (for voice captions)

**API Response Formats:**
- JSON - All API endpoints return JSON responses
- FileResponse - File serving endpoint returns binary file data

---

*Integration audit: 2026-01-26*
