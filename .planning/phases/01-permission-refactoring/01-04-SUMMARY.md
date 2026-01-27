---
phase: 01-permission-refactoring
plan: 04
subsystem: permissions
status: complete
tags: [django, models, migrations, permissions, cleanup]
requires:
  - 01-03 (Views and templates using ProjectAccess)
provides:
  - Clean codebase with single permission model (ProjectAccess)
  - No deprecated UserProfile models or boolean fields
  - ProjectAccess.role is sole source of truth for permissions
affects:
  - Phase 2+ (clean foundation for brain upload and viewer)
tech-stack:
  added: []
  patterns: [model-deletion-pattern, safe-migration-pattern]
key-files:
  created:
    - common/migrations/0018_rename_scans_filer_file_ty_a92f05_idx_maxillo_fil_file_ty_9e6e6a_idx_and_more.py
    - maxillo/migrations/0009_rename_scans_expor_user_id_a7d988_idx_maxillo_exp_user_id_2532ea_idx_and_more.py
  modified:
    - common/models.py
    - maxillo/models.py
    - maxillo/signals.py
    - brain/models.py
    - maxillo/views/profile.py
decisions:
  - decision: "Use SeparateDatabaseAndState for model deletion migrations"
    rationale: "Safe for rolling deployments where old code might still be running"
    impact: "Tables dropped cleanly without Django state conflicts"
  - decision: "Remove profile creation signals entirely"
    rationale: "Users get ProjectAccess via invitation acceptance, not automatic creation"
    impact: "New users start without project access until invited"
metrics:
  duration: 15 minutes
  completed: 2026-01-27
---

# Phase 01 Plan 04: Remove Deprecated UserProfile Models Summary

**One-liner:** Removed MaxilloUserProfile, BrainUserProfile models, can_view/can_upload fields from ProjectAccess, and profile creation signals — ProjectAccess.role is now sole source of truth

## What Was Accomplished

### Task 1: Remove deprecated fields and models from code ✅

**Status:** Complete

Cleaned up all deprecated permission-related code:

**1. common/models.py:**
- Removed `can_view` and `can_upload` BooleanFields from ProjectAccess
- Model now has only: user, project, role, created_at, and helper methods

**2. maxillo/models.py:**
- Removed entire `MaxilloUserProfile` class (~60 lines)
- Removed related imports and comments

**3. maxillo/signals.py:**
- Removed profile creation signal that auto-created MaxilloUserProfile
- Added placeholder signal with documentation for future use
- Users now get ProjectAccess via invitation acceptance only

**4. brain/models.py:**
- Removed entire `BrainUserProfile` class
- Left minimal file with imports and documentation comment

**Commit:** `d2f5c45` - refactor(01-04): remove deprecated UserProfile models and boolean fields

### Task 2: Create migrations to remove fields and models ✅

**Status:** Complete

Created migrations using Django's makemigrations (auto-generated):

**1. common/migrations/0018_*.py:**
- Removes `can_view` and `can_upload` fields from ProjectAccess
- Renames indexes for consistency

**2. maxillo/migrations/0009_*.py:**
- Deletes MaxilloUserProfile model
- Renames indexes for consistency

**3. brain/migrations/0003_delete_brainuserprofile.py:**
- Deletes BrainUserProfile model

All migrations applied successfully to database.

**Commit:** `a325721` - feat(01-04): create migrations to remove deprecated fields and models

### Task 3: Human verification checkpoint ✅

**Status:** Complete - APPROVED

**Issue discovered during verification:**
- `FieldError: Invalid field name(s) given in select_related: 'profile'`
- Caused by `maxillo/views/profile.py` line 146 using `select_related('profile')`
- The old OneToOne relationship no longer exists

**Fix applied:**
- Removed `select_related('profile')` from User query in profile view
- Simple `User.objects.order_by('username')` is sufficient for dropdown

**Commit:** `e50a5bd` - fix(01-04): remove select_related('profile') from user query

**User verification:**
- Application loads without errors
- Profile page displays correctly
- Permissions work as expected

## Deviations from Plan

1. **Migration file names differ from plan:**
   - Plan specified manual migration names (e.g., `0017_remove_projectaccess_booleans.py`)
   - Used Django's `makemigrations` which auto-generated names
   - Result: Same functionality, different file names

2. **Additional fix required:**
   - Plan didn't anticipate `select_related('profile')` in profile view
   - Fixed during checkpoint verification

## Verification Results

All verification checks passed:

1. **Code verification:** ✅
   - No `MaxilloUserProfile` class in maxillo/models.py
   - No `BrainUserProfile` class in brain/models.py
   - No `can_view`/`can_upload` fields in ProjectAccess
   - No profile creation in signals

2. **Database verification:** ✅
   - Profile tables dropped
   - ProjectAccess has only: id, created_at, project_id, user_id, role
   - All migrations applied

3. **Functional verification:** ✅
   - Application loads without errors
   - Login works
   - Profile page displays correct role
   - Permissions work correctly

## Architecture Notes

**Final Permission Model:**

After this plan, the permission architecture is:

```
User
  └── ProjectAccess (many, one per project)
        ├── project (FK to Project)
        ├── role (CharField: admin, annotator, project_manager, standard, student_dev)
        ├── created_at
        └── Helper methods:
            - is_admin()
            - is_annotator()
            - can_upload_scans()
            - can_view_other_profiles()
            - get_role_display()
```

**Middleware provides:**
- `request.user.profile` → ProjectAccess for current project
- `request.user_role` → role string
- `request.user_project_access` → same as profile

**For non-request contexts:**
- Use `PermissionChecker(user, project)` utility

## Phase 1 Complete

This was the final plan in Phase 1: Permission Refactoring.

**Phase 1 Success Criteria Met:**
1. ✅ User roles stored in ProjectAccess.role field
2. ✅ Permission checks use ProjectAccess.role consistently
3. ✅ MaxilloUserProfile and BrainUserProfile removed
4. ✅ Existing users can access projects with correct permissions
5. ✅ No duplicate permission checking code

**Ready for Phase 2:** Brain Upload can now build on clean permission foundation.

## Summary Statistics

- **Tasks completed:** 3/3 (100%)
- **Commits:** 3
  - `d2f5c45` - Remove deprecated models and fields
  - `a325721` - Create migrations
  - `e50a5bd` - Fix select_related('profile')
- **Files created:** 2 migrations (auto-generated)
- **Files modified:** 5 (common/models.py, maxillo/models.py, maxillo/signals.py, brain/models.py, maxillo/views/profile.py)
- **Deviations:** 1 (additional fix for select_related)
- **Duration:** 15 minutes
- **Checkpoint:** 1 human-verify (approved after fix)

---
*Phase: 01-permission-refactoring*
*Completed: 2026-01-27*
