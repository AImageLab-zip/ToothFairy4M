---
phase: 01-permission-refactoring
plan: 02
subsystem: permissions
status: complete
tags: [django, middleware, permissions, refactoring, context-processors]
requires:
  - 01-01 (ProjectAccess model with role field and helper methods)
provides:
  - PermissionChecker utility for non-request contexts
  - Middleware that sets request.user.profile to ProjectAccess
  - Context processor using ProjectAccess for role display
affects:
  - 01-03 (next plan in permission refactoring)
  - All views and templates that use request.user.profile
tech-stack:
  added: []
  patterns: [middleware-pattern, context-processor-pattern, utility-class]
key-files:
  created:
    - common/permissions.py
  modified:
    - toothfairy/middleware.py
    - common/context_processors.py
decisions:
  - decision: "Use ProjectAccess as request.user.profile"
    rationale: "Maintains backward compatibility with existing view/template code while using new unified model"
    impact: "Views can continue using user.profile.is_admin() etc. without changes"
  - decision: "Create separate PermissionChecker utility"
    rationale: "Background tasks, management commands need permission checks outside request context"
    impact: "Clean separation between request-based and non-request permission checking"
metrics:
  duration: 4 minutes
  completed: 2026-01-27
---

# Phase 01 Plan 02: Core Permission Infrastructure Summary

**One-liner:** Middleware sets request.user.profile to ProjectAccess; added PermissionChecker utility for non-request contexts

## What Was Accomplished

### Task 1: Create centralized permission utility ✅

**Status:** Complete

Created `common/permissions.py` with permission checking utilities:

- `get_user_project_access(user, project)`: Lookup helper that returns ProjectAccess or None
- `get_user_role(user, project)`: Extract role string from ProjectAccess
- `PermissionChecker` class: Utility for permission checks outside request context
  - Lazy-loads ProjectAccess for efficiency
  - Provides all permission methods: `is_admin()`, `can_upload_scans()`, etc.
  - Use case: Background tasks, management commands, utility functions

**Verification:**
- Django check passed
- Successfully instantiated PermissionChecker
- Tested role lookup and permission methods

**Commit:** `feb56ab` - feat(01-02): create centralized permission utility

### Task 2: Refactor middleware to use ProjectAccess ✅

**Status:** Complete

Refactored `toothfairy/middleware.py`:

- Removed imports of `MaxilloUserProfile` and `BrainUserProfile`
- Updated `ActiveProfileMiddleware` to lookup ProjectAccess by project slug and user
- Sets `request.user.profile = ProjectAccess` object (backward compatible)
- Also sets `request.user_role` and `request.user_project_access` for clarity
- Handles `Project.DoesNotExist` and `ProjectAccess.DoesNotExist` gracefully

**Backward Compatibility:**
ProjectAccess has same interface as old UserProfile models, so existing view/template code works unchanged:
- `user.profile.is_admin()`
- `user.profile.can_upload_scans()`
- `user.profile.get_role_display()`

**Verification:**
- Django check passed
- Middleware successfully sets `request.user.profile` to ProjectAccess
- Tested with RequestFactory: profile set correctly, methods work

**Commit:** `43cc05a` - refactor(01-02): migrate middleware to use ProjectAccess

### Task 3: Update common utilities to use ProjectAccess ✅

**Status:** Complete

Updated `common/context_processors.py`:

- Removed lookup of `{slug}_profile` attributes on user
- Now uses `request.user.profile` (set by middleware) as primary source
- Fallback: Direct ProjectAccess lookup if profile not set
- Simplified role display logic using `ProjectAccess.get_role_display()`
- No more dependency on app-specific UserProfile models

**Note:** `common/views.py` already uses `user.profile.is_admin` which works with ProjectAccess

**Verification:**
- Django check passed
- No imports of MaxilloUserProfile or BrainUserProfile in common/ or toothfairy/
- Context processor successfully resolves role from ProjectAccess

**Commit:** `cc70260` - refactor(01-02): update context processor to use ProjectAccess

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

All verification checks passed:

1. **Import verification:** ✅
   - No imports of MaxilloUserProfile in common/ or toothfairy/
   - No imports of BrainUserProfile in common/ or toothfairy/
   - Django check passed

2. **Middleware test:** ✅
   - Middleware sets `request.user.profile` to ProjectAccess object
   - Profile has correct type: ProjectAccess
   - Role accessible: `request.user.profile.role`
   - Methods work: `request.user.profile.is_admin()`

3. **PermissionChecker test:** ✅
   - PermissionChecker successfully instantiated
   - Role lookup works: `checker.role`
   - Permission methods work: `checker.can_upload_scans()`

## Architecture Notes

**Design Pattern: Middleware-based Profile Injection**

The middleware pattern provides clean separation:

1. **Request Context (Most Views):**
   - Middleware sets `request.user.profile = ProjectAccess`
   - Views/templates use `user.profile.is_admin()` directly
   - No explicit permission utility needed

2. **Non-Request Context (Background Tasks):**
   - Use `PermissionChecker(user, project)`
   - Same permission methods as ProjectAccess
   - Explicit user/project parameters

**Backward Compatibility Strategy:**

By maintaining the same interface (ProjectAccess has identical methods to old UserProfile models), we can refactor incrementally without breaking existing code. Views written for MaxilloUserProfile/BrainUserProfile work unchanged with ProjectAccess.

## Next Phase Readiness

**Unblocked:** Plan 01-03 can now proceed with:
- Middleware infrastructure in place
- All common/ and toothfairy/ code using ProjectAccess
- No remaining references to app-specific UserProfile models in shared code

**Dependencies satisfied:**
- ✅ Middleware sets request.user.profile to ProjectAccess
- ✅ PermissionChecker utility available for code outside request context
- ✅ Context processors use ProjectAccess for role display
- ✅ No imports of MaxilloUserProfile/BrainUserProfile in common/ or toothfairy/

**Next steps:** Plan 01-03 can proceed with refactoring view-level permission checks to use the new infrastructure.

## Summary Statistics

- **Tasks completed:** 3/3 (100%)
- **Commits:** 3 (one per task)
  - `feb56ab` - Create permission utility
  - `43cc05a` - Refactor middleware
  - `cc70260` - Update context processor
- **Files created:** 1 (common/permissions.py)
- **Files modified:** 2 (toothfairy/middleware.py, common/context_processors.py)
- **Deviations:** 0
- **Duration:** 4 minutes
