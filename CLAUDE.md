# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**ToothFairy4M** is a Django 5.2 web application for managing and processing dental/maxillofacial and brain MRI research imaging data. It supports multiple imaging modalities (IOS, CBCT, teleradiography, panoramic, brain MRI) with a job queue for async processing and AI-powered features (bite classification, speech-to-text annotation).

Live instance: https://toothfairy4m.ing.unimore.it

## Common Commands

All dev workflows go through Docker Compose via `make`:

```bash
make up              # Start containers (also creates proxy-net if missing)
make rebuild         # Rebuild images and restart
make down            # Stop and remove containers
make logs            # Follow all logs
make web-logs        # Follow Django app logs only

make migrate         # Run migrations inside web container
make makemigrations  # Create new migrations
make manage ARGS='check'  # Run any manage.py command
make createsuperuser

make web-shell       # Bash into the web container
make db-mysql        # Open MySQL client inside db container
```

Django runs on port defined by `WEB_EXTERNAL_PORT` in `.env` (default 8000).

The entrypoint (`entrypoint.sh`) automatically runs `collectstatic`, `makemigrations`, `migrate`, then `runserver 0.0.0.0:8000` on container start.

## Architecture

### Django Apps

**`common/`** — Cross-cutting models and utilities shared by all imaging modules:
- `Project`, `Modality`, `ProjectAccess` (RBAC), `Invitation`, `Job`, `ProcessingJob`, `FileRegistry`
- `permissions.py` — Central permission checks used by both maxillo and brain views
- `context_processors.py` — Injects active project and profile into all templates
- `views.py` — Admin control panel

**`maxillo/`** — Primary dental/maxillofacial module:
- Modalities: IOS (STL), CBCT (DICOM/NIfTI/NRRD), teleradiography, panoramic, intraoral photos, RawZip
- `file_utils.py` — Core file processing logic (very large file)
- `modality_processing_handlers.py` — Pluggable handlers per modality
- `api_views/` — REST API (projects, jobs, files, health)
- `api_urls.py` / `app_urls.py` — Separate URL configs for API vs. web routes

**`brain/`** — Brain tumor MRI module (parallel structure to maxillo):
- Modalities: FLAIR, T1, T1c, T2 MRI; CBCT

### Middleware (in `toothfairy/middleware.py`)
Three custom middlewares run on every request:
1. Request logging
2. Project session management (reads active project from session)
3. Active profile tracking

### Job Queue
Processing jobs use `common.Job` and `common.ProcessingJob` models. External processors (potentially Docker containers identified by `DOCKER_SUFFIX` env var) poll `/api/jobs/<job_type>/` and update status via `/api/jobs/<job_id>/mark_processing|completed|failed/`.

### File Storage
All files live under `DATASET_PATH` (default `/dataset`):
```
/dataset/maxillo/{raw,processed}/{ios,cbct,panoramic,teleradiography,intraoral,audio,bite,rawzip}/
/dataset/brain/{raw,processed}/{braintumor-mri-flair,braintumor-mri-t1,braintumor-mri-t1c,braintumor-mri-t2,cbct}/
/dataset/exports/
```

`FileRegistry` in the DB tracks metadata for every stored file.

### Key Configuration (`.env`)
- `DB_HOST=db` — MySQL container name
- `DATASET_PATH=/dataset` — Root for all patient data
- `DOCKER_SUFFIX` — Identifies which Docker processing containers to delegate jobs to
- `ENABLE_SSL` / `ENABLE_HTTPS_REDIRECT` — Toggle HTTPS in `settings.py`
- `CORS_ALLOWED_ORIGINS` — Comma-separated allowed origins

## Testing

API integration tests live in `test/`:
```bash
python test/test_upload.py      # Multi-modal upload tests
python test/run_test.py         # Interactive test runner
python test/test_external_api.py
```

Configure credentials and file paths in `test/config.py` before running.

There is no unit test suite or linting config. Use `make manage ARGS='check'` to run Django's system checks.
