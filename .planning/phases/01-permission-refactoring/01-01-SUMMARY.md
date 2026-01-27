---
phase: 01-permission-refactoring
plan: 01
subsystem: permissions
status: complete
tags: [django, migrations, permissions, refactoring]
requires: []
provides:
  - ProjectAccess model with role field and helper methods
  - Schema migration 0015 (role field)
  - Data migration 0016 (roles migrated from UserProfile)
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
    - maxillo/migrations/0007_rename_scans_class_patient_c507dc_idx_maxillo_cla_patient_219324_idx_and_more.py
  modified:
    - common/models.py
    - maxillo/apps.py
    - maxillo/migrations/0001_initial.py
    - multiple migration files (scans->maxillo rename)
decisions:
  - decision: "Keep can_view and can_upload fields in ProjectAccess"
    rationale: "Backward compatibility during transition period"
    impact: "Will be removed in later plan after all code references updated"
  - decision: "Complete app rename from 'scans' to 'maxillo'"
    rationale: "Fix pre-existing migration inconsistency blocking execution"
    impact: "Required database table renames and migration updates"
metrics:
  duration: 25 minutes (including orchestrator fixes)
  completed: 2026-01-27
---

# Phase 01 Plan 01: Add Role to ProjectAccess Summary

**One-liner:** Added role field to ProjectAccess with permission helper methods; completed app rename from scans to maxillo

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

### Task 2: Create schema migration for role field ✅

**Status:** Complete

Generated migration `common/migrations/0015_add_role_to_projectaccess.py`:
- Adds role field to projectaccess table
- Default value: 'standard'
- Max length: 20 characters
- Includes all 5 ROLE_CHOICES

**Commit:** `5be48c8` - feat(01-01): create schema migration for role field

### Task 3: Create data migration to copy roles ✅

**Status:** Complete

Created migration `common/migrations/0016_migrate_profile_roles.py` with:
- Forward migration: Copy roles from MaxilloUserProfile and BrainUserProfile to ProjectAccess
- Reverse migration: Restore profile roles from ProjectAccess
- update_or_create logic to handle existing ProjectAccess entries

**Commit:** `eca0f1c` - feat(01-01): create data migration for role migration

## Deviations from Plan

### Critical Fix: App Rename from 'scans' to 'maxillo' (Orchestrator)

**Problem:** The app was previously named 'scans' but was being migrated to 'maxillo'. This caused:
1. Django migration graph errors due to mismatched app labels
2. Model references pointing to 'scans.Patient' etc. with no 'scans' app
3. Database tables named `scans_*` but Django expecting `maxillo_*`

**Resolution:**
1. Changed `maxillo/apps.py` label from `scans` to `maxillo`
2. Updated all model references in `common/models.py` from `'scans.X'` to `'maxillo.X'`
3. Updated all migration references from `('scans',` to `('maxillo',`
4. Renamed database tables from `scans_*` to `maxillo_*`
5. Updated `django_migrations` table app column

**Orchestrator Commit:** `1b57713` - fix(01-01): complete scans->maxillo app rename

## Verification

```bash
# Check migrations applied
docker compose exec web python manage.py showmigrations common
# common
#  [X] 0015_add_role_to_projectaccess
#  [X] 0016_migrate_profile_roles

# Verify helper methods work
docker compose exec web python manage.py shell -c "
from common.models import ProjectAccess
pa = ProjectAccess.objects.first()
print(f'is_admin(): {pa.is_admin()}')
print(f'can_upload_scans(): {pa.can_upload_scans()}')
print(f'get_role_display(): {pa.get_role_display()}')
"
# Output:
# is_admin(): False
# can_upload_scans(): False
# get_role_display(): Standard User
```

## Next Phase Readiness

**Unblocked:** Plan 01-02 can now proceed with:
- ProjectAccess model has role field with all helper methods
- Migrations applied successfully
- Container running normally

**Dependencies satisfied:**
- ✅ ProjectAccess.role field exists
- ✅ Helper methods available (is_admin, can_upload_scans, etc.)
- ✅ Data migrated from UserProfile models

## Summary Statistics

- **Tasks completed:** 3/3 (100%)
- **Commits:** 5 (3 from executor, 1 orchestrator fix, 1 metadata)
- **Files modified:** 4 core + 12 migration files
- **Deviations:** 1 critical (app rename fix)
- **Duration:** ~25 minutes
