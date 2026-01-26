# Codebase Concerns

**Analysis Date:** 2026-01-26

## Tech Debt

**Duplicate User Profile Models:**
- Issue: Two separate user profile models (`MaxilloUserProfile` and `BrainUserProfile`) maintain identical ROLE_CHOICES and methods instead of sharing a common profile
- Files: `maxillo/models.py`, `brain/models.py`
- Impact: Code duplication, inconsistent permission updates, difficult to maintain role logic across projects
- Fix approach: Create a single `UserProfile` model in `common/models.py` with a project reference, or use a mixin to share role methods

**Overly Large Single Files:**
- Issue: `maxillo/file_utils.py` (1190 lines), `maxillo/models.py` (856 lines), `maxillo/api_views/projects.py` (669 lines) are difficult to maintain
- Files: `maxillo/file_utils.py`, `maxillo/models.py`, `maxillo/api_views/projects.py`, `maxillo/views/patient_data.py` (519 lines)
- Impact: Hard to test, high risk of bugs when modifying, makes code navigation difficult
- Fix approach: Split into smaller modules by functionality (e.g., file_utils → file_handlers.py, file_registry.py, etc.)

**Inconsistent Permission Checking:**
- Issue: Permission checks scattered across views/API endpoints with duplicate logic (e.g., `is_admin()`, `can_upload_scans()` called in multiple places)
- Files: `maxillo/api_views/projects.py:44-50`, `maxillo/views/patient_upload.py:21`, `maxillo/views/deletion.py:31,126`, `maxillo/api_views/files.py:82,98,110`
- Impact: Risk of permission bypass if logic is updated in one place but not another
- Fix approach: Use the `security.py` decorators consistently (`@require_patient_access`, `@require_project_access`)

**Missing Type Hints:**
- Issue: Most Python files lack type hints, making code harder to understand and prone to runtime errors
- Files: All Python files in `maxillo/`, `common/`, `brain/` apps
- Impact: Type errors not caught until runtime, IDE support is limited, harder to refactor safely
- Fix approach: Add type hints to function signatures and class attributes systematically

## Known Bugs

**Profile Not Found Redirects to Home:**
- Symptoms: User gets redirected to `/` when `ActiveProfileMiddleware` fails to find a profile, silently losing context
- Files: `toothfairy/middleware.py:137` - `ActiveProfileMiddleware.process_request()`
- Trigger: User accessing an app (maxillo/brain) where they haven't been assigned a profile yet
- Workaround: Admin must manually create the profile in the database before user can access that app
- Fix approach: Create profile automatically on first access instead of raising exception

**Duplicate String `__str__()` in BrainUserProfile:**
- Symptoms: Two `__str__()` methods defined in same class (lines 20-21 and 64-65)
- Files: `brain/models.py`
- Impact: Second definition silently overrides first, confusing future maintainers
- Fix approach: Remove duplicate method definition

**IOS Fallback Mapping Returns Wrong Modality:**
- Symptoms: When modality slug is 'ios', fallback mapping returns 'cbct_raw' instead of 'ios_raw'
- Files: `maxillo/file_utils.py:64` - fallback_mappings dictionary
- Trigger: Any IOS file upload for modality that doesn't have specific raw/processed type
- Impact: IOS files incorrectly stored as CBCT type in FileRegistry
- Fix approach: Change line 64 from `'ios': 'cbct_raw'...` to `'ios': 'ios_raw_upper'...` (or 'ios_raw_lower')

## Security Considerations

**Credentials in .env File (Development Hardcoding):**
- Risk: Database and application secrets stored in committed `.env` file with hardcoded values
- Files: `.env` (lines 8, 15, 21-22)
- Current mitigation: Marked as dev environment, but hardcoded values like `s3cr4t_k3y_f0r_d3v3l0pm3nt` and `p@ssw@rdtf4m` are placeholders
- Recommendations:
  - Use environment-specific `.env.local` (gitignored) for actual values
  - Add `.env` template file with placeholder values only
  - Generate unique SECRET_KEY per environment

**@csrf_exempt on Multiple API Endpoints:**
- Risk: CSRF protection disabled on user-modifying endpoints without token validation
- Files: `maxillo/api_views/projects.py:22`, `maxillo/api_views/files.py:56,153`, `maxillo/views/folders_tags.py` (multiple), `maxillo/views/classification.py`
- Current mitigation: Some endpoints check `request.user.is_authenticated`, but not all
- Recommendations:
  - Remove @csrf_exempt from state-changing endpoints (POST, PUT, DELETE)
  - Use Django's built-in CSRF token handling or verify with custom token/API key
  - Or implement token-based authentication (Bearer tokens) instead

**ActiveProfileMiddleware Silently Redirects on Profile Missing:**
- Risk: User access attempts silently redirect instead of providing helpful error messages
- Files: `toothfairy/middleware.py:134-137`
- Current mitigation: Logs debug info, but users see no explanation
- Recommendations:
  - Create profile automatically on first access
  - Return 403 Forbidden with clear message instead of silently redirecting
  - Log warnings for security monitoring

**Project Access Model Missing `can_admin` Field:**
- Risk: `security.py:130-134` checks for `can_admin` field that doesn't exist in `ProjectAccess` model
- Files: `maxillo/security.py:130-134` (checks for field), `common/models.py:57-65` (model definition missing it)
- Impact: Admin permission checks will always fail silently
- Fix approach: Add `can_admin = models.BooleanField(default=False)` to `ProjectAccess` model and create migration

**Database Cursor execute() with String Formatting Risk:**
- Risk: While using parameterized queries, the comment claims "SECURITY" on code with proper parameterization
- Files: `maxillo/management/commands/change_patient_id.py:104-147`
- Current mitigation: Properly uses parameterized queries with %s placeholders
- Note: Code is secure but manual command requires operator care

## Performance Bottlenecks

**N+1 Query Problem in patient_list:**
- Problem: While `select_related` and `prefetch_related` are used, each Patient still queries related modalities and files
- Files: `maxillo/views/patient_list.py:83-98`
- Cause: Multiple related-object queries even with prefetch
- Improvement path:
  - Profile query performance with Django Debug Toolbar
  - Consider pagination limits (currently shows all patients)
  - Cache modality/tag lookups that don't change frequently

**Export Processing Blocks Request Thread:**
- Problem: Export creation happens in request/response cycle without background job
- Files: `maxillo/views/export.py` (threading import but no async queue visible)
- Cause: Large ZIP file generation for entire datasets done synchronously
- Improvement path:
  - Implement Celery or similar task queue for long-running exports
  - Return job ID immediately, let user check status asynchronously
  - Move export processing to background worker

**FileRegistry Lookups Without Index:**
- Problem: Frequent queries on `file_path` without guaranteed uniqueness check
- Files: `common/models.py:395` - `file_path = CharField(unique=True)`
- Cause: While unique constraint exists, full table scans possible for other filter combinations
- Improvement path: Verify database has indexes on all common filter combinations

**Large File Uploads Without Streaming:**
- Problem: File upload processing in memory (form validation before saving)
- Files: `maxillo/forms.py`, `maxillo/views/patient_upload.py`
- Impact: Large DICOM/NIfTI files could cause memory exhaustion
- Improvement path: Implement streaming file upload with chunked processing

## Fragile Areas

**Complex Job Dependency Logic in Models:**
- Files: `common/models.py:174-211` (Job class), `common/models.py:304-341` (ProcessingJob class)
- Why fragile: Manual status transitions based on dependency checks, no atomic guarantees
- Safe modification: Always test dependency scenarios (no deps, with deps, partially completed deps)
- Test coverage: Gaps in testing job state transitions, especially race conditions

**Profile Resolution in Middleware:**
- Files: `toothfairy/middleware.py:103-137` (ActiveProfileMiddleware)
- Why fragile: Hardcoded app names ('maxillo', 'brain'), assumes profile exists or creates redirect
- Safe modification: Add comprehensive tests for all user/app combinations, consider default profile
- Test coverage: No tests visible for middleware behavior

**Project Access Control Scattered:**
- Files: `maxillo/security.py` (centralized), but `maxillo/views/patient_list.py:57-66` (local checks)
- Why fragile: Some views use security.py functions, others use inline permission checks
- Safe modification: Enforce use of decorators consistently, remove inline checks
- Test coverage: Need integration tests proving all access paths respect permissions

**File Type Mapping with Multiple Fallbacks:**
- Files: `maxillo/file_utils.py:24-84` (get_file_type_for_modality)
- Why fragile: 7+ fallback cases with hardcoded type mappings, IOS bug shows this is error-prone
- Safe modification: Add comprehensive tests for each modality/subtype combination
- Test coverage: No unit tests for this critical function visible

## Scaling Limits

**Single Database Connection Pool:**
- Current capacity: Limited by Django's single DB connection pool (default ~10 connections)
- Limit: High concurrency with long-running exports or processing jobs will exhaust connections
- Scaling path:
  - Configure `CONN_MAX_AGE` in settings
  - Use connection pooling (PgBouncer for PostgreSQL)
  - Move heavy processing to background jobs

**No Horizontal Scaling for File Processing:**
- Current capacity: Processing jobs limited to single Docker container
- Limit: CBCT/IOS processing (CPU-intensive) blocks other operations
- Scaling path:
  - Implement job queue (Celery/RQ) with multiple workers
  - Allow processing on separate container/machine
  - Add job priority and rate limiting

**FileRegistry Storage Location Hardcoded:**
- Current capacity: Single `/dataset` path on single filesystem
- Limit: Storage exhaustion on single disk, no redundancy
- Scaling path:
  - Support cloud storage (S3, MinIO) as alternative to local filesystem
  - Implement archive strategy for old files

## Dependencies at Risk

**Outdated Pillow (11.3.0):**
- Risk: Latest Pillow is 11.3.0, check for security advisories
- Impact: Image processing vulnerabilities could allow DoS or code execution
- Migration plan: Upgrade to latest Pillow version, test image upload/processing

**Django 5.2.4 Security Updates:**
- Risk: Ensure all 5.2.x patches are applied
- Impact: Known Django vulnerabilities could allow auth bypass or data leakage
- Migration plan: Monitor Django security announcements, upgrade patch versions

**nibabel 5.2.0 (Medical Imaging):**
- Risk: Older versions of nibabel had NIFTI parsing bugs
- Impact: Malformed NIFTI files could crash processing or expose memory
- Migration plan: Upgrade to latest nibabel, add NIFTI validation before processing

## Missing Critical Features

**No Rate Limiting:**
- Problem: API endpoints have no rate limiting, vulnerable to brute force/DoS
- Blocks: Cannot safely expose API to untrusted networks
- Solution: Implement rate limiting on `project_upload_api`, file serving endpoints

**No Request Logging/Audit Trail:**
- Problem: While `RequestLoggingMiddleware` logs requests, no persistent audit trail for sensitive operations
- Blocks: Cannot prove compliance with data access requirements
- Solution: Implement audit logging for patient data access, exports, deletions

**No Encryption at Rest:**
- Problem: Patient files stored unencrypted on disk
- Blocks: HIPAA/GDPR compliance concerns
- Solution: Implement file-level encryption or encrypted filesystem

**No API Documentation:**
- Problem: API endpoints lack documentation, only docstrings in code
- Blocks: Third-party integrations cannot be built safely
- Solution: Add OpenAPI/Swagger documentation with authentication examples

## Test Coverage Gaps

**No Unit Tests for Modality Processing:**
- What's not tested: `get_file_type_for_modality()` function, all file upload handlers
- Files: `maxillo/file_utils.py` (entire module), `maxillo/forms.py`
- Risk: Breaking changes to file type mapping not caught until production
- Priority: High - this is critical path for data ingestion

**No Integration Tests for Job Processing:**
- What's not tested: Full flow from patient upload → job creation → completion
- Files: `common/models.py` (Job/ProcessingJob), all job handlers
- Risk: Job state transition bugs not caught, dependency logic fails silently
- Priority: High - job processing is core functionality

**No Permission/Authorization Tests:**
- What's not tested: User role enforcement, project access control
- Files: `maxillo/security.py`, `toothfairy/middleware.py`
- Risk: Authorization bypass not detected until security audit
- Priority: Critical - data access control is essential

**No Middleware Tests:**
- What's not tested: Profile resolution, project session management
- Files: `toothfairy/middleware.py`
- Risk: Silent failures in request/response pipeline
- Priority: Medium - affects all authenticated requests

**No API Endpoint Tests:**
- What's not tested: CSRF exemption, authentication, error handling
- Files: `maxillo/api_views/` (all endpoints)
- Risk: API breaking changes not detected
- Priority: Medium - only if API is public

---

*Concerns audit: 2026-01-26*
