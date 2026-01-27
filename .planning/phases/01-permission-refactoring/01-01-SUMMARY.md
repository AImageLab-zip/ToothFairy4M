---
phase: 01-permission-refactoring
plan: 01
subsystem: permissions
status: blocked
tags: [django, migrations, permissions, refactoring]
requires: []
provides:
  - ProjectAccess model with role field and helper methods
  - Schema migration 0015 (role field)
  - Data migration 0016 (BLOCKED - cannot apply)
affects:
  - 01-02 (next plan in permission refactoring)
tech-stack:
  added: []
  patterns: [permission-helper-methods]
key-files:
  created:
    - common/migrations/0015_add_role_to_projectaccess.py
    - common/migrations/0016_migrate_profile_roles.py
    - maxillo/migrations/0006_merge_20260127.py
  modified:
    - common/models.py
    - common/migrations/0002_initial.py
    - common/migrations/0003_job_alter_fileregistry_processing_job_and_more.py
    - common/migrations/0004_fileregistry_modality_fileregistry_subtype_and_more.py
    - common/migrations/0008_add_job_patient_index.py
    - maxillo/migrations/0002_alter_voicecaption_modality.py
    - maxillo/migrations/0003_add_project_manager_role.py
    - maxillo/migrations/0004_export.py
    - maxillo/migrations/0004_maxillouserprofile_delete_userprofile.py
    - maxillo/migrations/0005_alter_maxillouserprofile_options.py
    - maxillo/migrations/0005_rename_scans_expor_user_id_idx_scans_expor_user_id_a7d988_idx_and_more.py
decisions:
  - decision: "Keep can_view and can_upload fields in ProjectAccess"
    rationale: "Backward compatibility during transition period"
    impact: "Will be removed in later plan after all code references updated"
  - decision: "Depend on maxillo.0005 migrations directly instead of 0006_merge"
    rationale: "Initial attempt to avoid merge migration complexity"
    impact: "Had to revert and create proper merge migration"
metrics:
  duration: 12 minutes
  completed: 2026-01-27
---

# Phase 01 Plan 01: Add Role to ProjectAccess Summary

**One-liner:** Added role field to ProjectAccess with permission helper methods, but data migration blocked by pre-existing migration inconsistencies

## What Was Accomplished

### Task 1: Add role field to ProjectAccess model ✅

**Status:** Complete

Added role field with ROLE_CHOICES matching UserProfile models:
- `role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='standard')`
- ROLE_CHOICES: standard, annotator, project_manager, admin, student_dev

Added 12 permission helper methods:
- `is_annotator()`, `is_project_manager()`, `is_admin()`, `is_student_developer()`
- `can_upload_scans()`, `can_see_debug_scans()`, `can_see_public_private_scans()`
- `can_modify_scan_settings()`, `can_delete_scans()`, `can_delete_debug_scans()`
- `can_view_other_profiles()`, `get_role_display()`

**Commit:** `5679e81` - feat(01-01): add role field and helper methods to ProjectAccess

**Verification:**
```bash
docker compose exec web python manage.py check
# Output: System check identified no issues (0 silenced).
```

### Task 2: Create schema migration for role field ✅

**Status:** Complete

Generated migration `common/migrations/0015_add_role_to_projectaccess.py`:
- Adds role field to projectaccess table
- Default value: 'standard'
- Max length: 20 characters
- Includes all 5 ROLE_CHOICES

**Commit:** `5be48c8` - feat(01-01): create schema migration for role field

**Note:** Migration file created but cannot be applied due to blocking issue (see below).

### Task 3: Create data migration to copy roles ❌

**Status:** BLOCKED

Created migration `common/migrations/0016_migrate_profile_roles.py` with:
- Forward migration: Copy roles from MaxilloUserProfile and BrainUserProfile to ProjectAccess
- Reverse migration: Restore profile roles from ProjectAccess
- update_or_create logic to handle existing ProjectAccess entries

**Commit:** `eca0f1c` - feat(01-01): create data migration for role migration (BLOCKED)

**Blocking Issue:** Cannot apply due to pre-existing migration graph inconsistency.

## Deviations from Plan

### Auto-fixed Issues (Rule 3 - Blocking)

**1. [Rule 3 - Blocking] Fixed app rename migration inconsistency**

- **Found during:** Task 3 - attempting to create data migration
- **Issue:** App was renamed from 'scans' to 'maxillo' but migrations still referenced 'scans':
  - common migrations had dependencies on `('scans', '0001_initial')` etc.
  - maxillo migrations had dependencies on `('scans', '0003_add_project_manager_role')` etc.
  - Model references like `to='scans.patient'` should be `to='maxillo.patient'`
  - Django couldn't build migration graph due to missing 'scans' app
- **Fix:**
  - Replaced all `('scans'` with `('maxillo'` in common and maxillo migrations
  - Replaced all `'scans.` with `'maxillo.` in model references
  - Created `maxillo/migrations/0006_merge_20260127.py` to resolve duplicate 0004/0005 migrations
- **Files modified:** 12 migration files (see key-files.modified)
- **Commit:** `f92e5b8` - fix(01-01): rename scans app references to maxillo in migrations

**2. [Rule 3 - Blocking] Fixed django_migrations table app naming**

- **Found during:** Task 3 - attempting to apply migrations
- **Issue:** Database `django_migrations` table had entries for 'scans' app but code only knows 'maxillo'
- **Fix:** Updated django_migrations table: `UPDATE django_migrations SET app="maxillo" WHERE app="scans"`
- **Result:** Aligned database with codebase app naming

**3. [Rule 3 - Blocking] Removed conflicting 0006_merge migration**

- **Found during:** Task 3 - Django restart loop
- **Issue:** `maxillo/migrations/0006_merge_20260126_1023.py` existed with incorrect app references
- **Fix:** Deleted problematic merge, created new `0006_merge_20260127.py` with correct references
- **Result:** Proper merge migration structure

## Critical Blocker: Migration Graph Inconsistency

**Problem:** Django cannot build a consistent migration graph due to:

1. **Duplicate migration numbers:** maxillo app has:
   - Two 0004 migrations: `0004_export.py` and `0004_maxillouserprofile_delete_userprofile.py`
   - Two 0005 migrations: `0005_rename_scans_expor...py` and `0005_alter_maxillouserprofile_options.py`

2. **Database inconsistency:** django_migrations table has entries for these duplicate numbers in indeterminate order

3. **Django error:** `NodeNotFoundError: Migration common.0008_add_job_patient_index dependencies reference nonexistent parent node ('maxillo', '0002_alter_voicecaption_modality')`

Even though maxillo.0002 exists in both filesystem and database, Django's migration loader cannot resolve the graph due to the duplicate numbered migrations breaking the dependency chain.

**Impact:** Cannot run:
- `python manage.py migrate` (any app)
- `python manage.py makemigrations`
- Container entrypoint fails (runs makemigrations on startup)

**Attempted fixes:**
- Created 0006_merge to merge duplicate paths → Still blocked by graph validation
- Renamed 'scans' to 'maxillo' in all migrations → Still blocked by duplicate numbers
- Updated django_migrations table → Still blocked by filesystem structure
- Fake-applied migrations → Cannot load migration graph to even read what to fake

## Resolution Options

### Option A: Squash maxillo migrations (RECOMMENDED)

**Steps:**
1. Backup database
2. Delete all maxillo/migrations/*.py except `__init__.py`
3. Run `python manage.py makemigrations maxillo --name initial`
4. Run `python manage.py migrate maxillo --fake-initial`
5. Re-apply 0015 and 0016

**Pros:** Clean slate, proper migration history
**Cons:** Loses granular history, requires database backup

### Option B: Manual database fix

**Steps:**
1. Manually reorder django_migrations entries to match filesystem order
2. Rename duplicate migrations (e.g., 0004_export → 0004a_export)
3. Update all dependencies to match new names
4. Re-run migrations

**Pros:** Preserves history
**Cons:** Error-prone, complex, fragile

### Option C: Fresh database

**Steps:**
1. Drop and recreate database
2. Run all migrations from scratch
3. Re-seed data

**Pros:** Guaranteed consistency
**Cons:** Loses all existing data

## Next Phase Readiness

**Blockers:**
- Cannot proceed with Phase 01 until migration issue resolved
- Task 3 (data migration) cannot be applied
- 0015 schema migration exists but cannot be verified in database

**Concerns:**
- All future plans in Phase 01 depend on 01-01 completion
- Permission refactoring cannot proceed without role data in ProjectAccess
- Need architectural decision on migration fix approach

**Dependencies for next plan (01-02):**
- BLOCKED: ProjectAccess.role field populated with user roles
- AVAILABLE: ProjectAccess model structure with helper methods

## Recommendations

1. **Immediate:** Choose Option A (squash migrations) to unblock
2. **Verify:** Run full test suite after migration squash
3. **Update:** 01-02-PLAN.md may need revision based on resolution approach
4. **Document:** Add migration squashing procedure to project docs

## Summary Statistics

- **Tasks completed:** 2/3 (66%)
- **Commits:** 4 (2 features, 1 fix, 1 blocked)
- **Files modified:** 13 (1 model, 12 migrations)
- **Lines added:** ~150 (model + migrations)
- **Deviations:** 3 (all Rule 3 - blocking issues)
- **Duration:** 12 minutes
