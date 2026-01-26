# Technology Stack

**Analysis Date:** 2026-01-26

## Languages

**Primary:**
- Python 3.11 - Backend application language, defined in `Dockerfile` line 1

**Secondary:**
- JavaScript/HTML/CSS - Frontend templates and static assets in `/templates` and `/static`

## Runtime

**Environment:**
- Python 3.11-slim (Docker image)
- Django development server on port 8000

**Package Manager:**
- pip - Python package management
- Lockfile: `requirements.txt` at project root

## Frameworks

**Core:**
- Django 5.2.4 - Web framework for Python, MVT pattern
  - INSTALLED_APPS in `toothfairy/settings.py`: admin, auth, contenttypes, sessions, messages, staticfiles
  - Custom apps: `common`, `maxillo`, `brain`

**API & HTTP:**
- Django REST Framework - Not explicitly in requirements.txt but API views defined in `maxillo/api_views/`
- django-cors-headers 4.7.0 - CORS support for cross-origin requests

**Database:**
- MySQL 8.0 - Primary database backend
- mysqlclient 2.2.7 - Python MySQL adapter

**Medical/Scientific Computing:**
- nibabel 5.2.0 - NIfTI/medical imaging file format support (used in `maxillo/views/metadata.py`)
- numpy 2.3.2 - Numerical computing library
- trimesh 4.7.1 - 3D mesh processing (supports DICOM, mesh formats)
- Pillow 11.3.0 - Image processing

**Configuration & Utilities:**
- python-decouple 3.8 - Environment variable configuration management
- sqlparse 0.5.3 - SQL parsing utilities
- asgiref 3.9.1 - ASGI support utilities

## Key Dependencies

**Critical:**
- Django 5.2.4 - Web framework; migration system manages database schema
- mysqlclient 2.2.7 - Database connectivity; required for MySQL backend
- nibabel 5.2.0 - Medical imaging support for NIfTI format files
- trimesh 4.7.1 - 3D geometry processing for medical datasets
- django-cors-headers 4.7.0 - API access from external clients

**Infrastructure:**
- python-decouple 3.8 - Env variable loading (DB credentials, secrets, configuration)

## Configuration

**Environment:**
- Configured via `.env` file in project root
- Variables loaded using `python-decouple.config()`
- Settings file: `toothfairy/settings.py`

**Key configurations required:**
- `SECRET_KEY` - Django secret for cryptography
- `DEBUG` - Development/production mode toggle
- `ALLOWED_HOSTS` - Allowed domain names
- `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_PORT` - MySQL connection details
- `DATASET_PATH` - Path to medical dataset storage (default: `/dataset`)
- `DOMAIN` - Public domain for HTTPS
- `ENABLE_SSL`, `ENABLE_HTTPS_REDIRECT` - HTTPS configuration
- `CSRF_TRUSTED_ORIGINS` - Trusted origin domains for CSRF protection

**Build:**
- `Dockerfile` - Multi-stage Python 3.11 container build
- `docker-compose.yml` - Orchestrates web service and MySQL database
- `entrypoint.sh` - Container startup script that runs migrations and Django server

## Platform Requirements

**Development:**
- Docker & Docker Compose
- Python 3.11 (for local development without Docker)
- MySQL 8.0 (or Docker-managed MySQL)
- Minimum 2GB RAM for Docker containers
- `/dataset` directory mounted for medical imaging data

**Production:**
- Docker container runtime
- MySQL 8.0 database server
- Reverse proxy (nginx mentioned in `nginx.conf`) with LETSENCRYPT support
- HTTPS certificate management via Let's Encrypt
- External network `proxy-net` for reverse proxy integration

## Security Features

- Django CSRF protection with session-based tokens (`CSRF_USE_SESSIONS = True`)
- HTTPS enforcement with HSTS headers (when enabled)
- Secure cookies (HttpOnly, SameSite=Strict)
- Environment-based secret management via decouple
- File upload size limits: 5GB per file, 1500 files per request
- User authentication via Django's built-in auth system
- Permission-based access control for projects and files

---

*Stack analysis: 2026-01-26*
