---
phase: 01-permission-refactoring
plan: 03
subsystem: permissions
status: complete
tags: [django, views, templates, permissions, refactoring]
requires:
  - 01-02 (Middleware sets request.user.profile to ProjectAccess)
provides:
  - Auth view creates ProjectAccess on user registration
  - Profile view passes ProjectAccess to templates
  - Templates use ProjectAccess for role display
  - No view code imports MaxilloUserProfile or BrainUserProfile
affects:
  - 01-04 (next plan in permission refactoring)
  - All view and template code that references user profiles
tech-stack:
  added: []
  patterns: [view-template-context-pattern]
key-files:
  created: []
  modified:
    - maxillo/views/auth.py
    - maxillo/views/profile.py
    - templates/maxillo/user_profile.html
decisions:
  - decision: "Simplify auth view to create only ProjectAccess on registration"
    rationale: "Removed app-specific profile creation logic, unified user onboarding"
    impact: "New users get ProjectAccess with role from invitation, no UserProfile models involved"
  - decision: "Pass target_profile explicitly to templates"
    rationale: "Middleware only sets request.user.profile for logged-in user, target user needs explicit lookup"
    impact: "Templates receive target_profile in context for displaying other users' profiles"
metrics:
  duration: 7 minutes
  completed: 2026-01-27
---

# Phase 01 Plan 03: Refactor View-Level Permission Checks Summary

**One-liner:** Auth view creates ProjectAccess on registration; profile view passes ProjectAccess to templates; no MaxilloUserProfile/BrainUserProfile imports in views

## What Was Accomplished

### Task 1: Update auth view to use ProjectAccess ✅

**Status:** Complete

Refactored `maxillo/views/auth.py` registration flow:

- **Removed:** Imports of MaxilloUserProfile and BrainUserProfile
- **Removed:** App-specific profile creation logic (get_or_create for each app)
- **Added:** Unified ProjectAccess creation with role from invitation
- **Simplified:** Registration flow now creates only ProjectAccess, not separate UserProfile models

**Key Changes:**
- Registration determines project from invitation
- ProjectAccess created with role from invitation (or 'standard' default)
- Removed conditional logic for maxillo vs brain apps
- 38 lines simplified to 12 (26 line reduction)

**Verification:**
- Django check passed
- No imports of MaxilloUserProfile or BrainUserProfile in auth.py
- Code compiles and runs without errors

**Commit:** `fbd93dd` - feat(01-03): update auth view to use ProjectAccess

### Task 2: Update profile view and template ✅

**Status:** Complete

Refactored `maxillo/views/profile.py` and `templates/maxillo/user_profile.html`:

**Profile View Changes:**
- Added import of ProjectAccess
- Lookup target user's ProjectAccess for current project
- Pass `target_profile` to template context
- Handle ProjectAccess.DoesNotExist gracefully

**Template Changes:**
- Replaced `target_user.profile` with `target_profile` from context
- Added conditional checks for `target_profile` existence
- Role display uses `target_profile.get_role_display`

**Why Explicit Lookup:**
Middleware only sets `request.user.profile` for the logged-in user. When displaying another user's profile (target_user), we need explicit ProjectAccess lookup and pass it via context.

**Verification:**
- Django check passed
- Template renders without errors
- No references to `target_user.profile` remain in templates
- Role badges display correctly

**Commit:** `69c25d0` - feat(01-03): update profile view and template to use ProjectAccess

### Task 3: Human verification checkpoint ✅

**Status:** Complete - APPROVED

**What was verified:**
- All pages load without errors
- Profile view displays correctly
- Role badges show proper roles
- No template errors in browser console or server logs

**User feedback:** "All the pages load without error."

**Note:** User observed UserProfile still appears in admin interface. This is expected - admin cleanup is scheduled for Plan 01-04.

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

All verification checks passed:

1. **Import verification:** ✅
   ```bash
   grep -rn "MaxilloUserProfile\|BrainUserProfile" maxillo/views/auth.py
   # Result: Empty (no imports or usage)
   ```

2. **Template verification:** ✅
   ```bash
   grep -rn "target_user\.profile" templates/maxillo/user_profile.html
   # Result: Empty (all replaced with target_profile)
   ```

3. **Functional verification:** ✅
   - Pages load successfully
   - Role badges display correctly
   - No errors in logs

## Architecture Notes

**Pattern: Explicit Context for Target Users**

The refactoring establishes a clear pattern:

1. **Logged-in user (request.user):**
   - Middleware sets `request.user.profile = ProjectAccess`
   - Templates use `user.profile.is_admin()` directly
   - Automatic, no explicit lookup needed

2. **Target users (viewing other profiles):**
   - View explicitly looks up `ProjectAccess` for target user
   - Pass `target_profile` in template context
   - Templates use `target_profile.get_role_display()` etc.

This pattern maintains clarity: middleware handles the logged-in user, views handle other users.

## Next Phase Readiness

**Unblocked:** Plan 01-04 can now proceed with:
- All view code using ProjectAccess
- No remaining imports of MaxilloUserProfile/BrainUserProfile in views
- Templates using ProjectAccess for role display
- Clean foundation for admin cleanup and final UserProfile model removal

**Dependencies satisfied:**
- ✅ Auth view creates ProjectAccess on registration
- ✅ Profile view passes ProjectAccess to templates
- ✅ Templates display ProjectAccess data correctly
- ✅ No MaxilloUserProfile/BrainUserProfile references in view code

**Next steps:** Plan 01-04 can proceed with:
- Removing UserProfile models from admin interface
- Cleaning up any remaining UserProfile references
- Final verification that all code uses ProjectAccess exclusively

## Summary Statistics

- **Tasks completed:** 3/3 (100%)
- **Commits:** 2 (one per implementation task)
  - `fbd93dd` - Update auth view
  - `69c25d0` - Update profile view and template
- **Files created:** 0
- **Files modified:** 3 (maxillo/views/auth.py, maxillo/views/profile.py, templates/maxillo/user_profile.html)
- **Lines changed:** ~50 total (26 reduced in auth.py, 24 added across profile view and template)
- **Deviations:** 0
- **Duration:** 7 minutes
- **Checkpoint:** 1 human-verify (approved)

---
*Phase: 01-permission-refactoring*
*Completed: 2026-01-27*
