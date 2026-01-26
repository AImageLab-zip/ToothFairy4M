# Phase 1: Permission Refactoring - Research

**Researched:** 2026-01-26
**Domain:** Django permission refactoring and data migration
**Confidence:** HIGH

## Summary

Permission refactoring in Django requires careful planning when consolidating multiple permission models into a single source of truth. This research focused on safely removing the duplicate MaxilloUserProfile and BrainUserProfile models, migrating their role data to ProjectAccess, and updating permission checks throughout the codebase.

The standard approach involves a multi-phase migration strategy: first migrate data from old models to the new structure, then update all code references, and finally remove the old models in a separate deployment. Django 5.2's migration system provides robust tools for this refactoring, particularly `RunPython` for data migrations and `SeparateDatabaseAndState` for safe model removal.

The current codebase has a dual permission system where roles are stored in separate UserProfile models (MaxilloUserProfile and BrainUserProfile) with identical implementations, while ProjectAccess uses boolean fields (can_view, can_upload). This creates permission checking inconsistencies and duplication. The refactoring will consolidate roles into ProjectAccess.role field, making it the single source of truth for all permission decisions.

**Primary recommendation:** Use a three-migration strategy: (1) add role field to ProjectAccess and migrate data, (2) update all permission checks to use ProjectAccess.role, (3) remove UserProfile models using SeparateDatabaseAndState for safe deployment.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Django | 5.2.4 | Web framework with built-in migration system | Project's current version with stable migration APIs |
| django.db.migrations | 5.2.4 | Database migration toolkit | Django's official migration system with RunPython and SeparateDatabaseAndState |
| MySQL | 8.0 | Database backend | Project's current database |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| django.contrib.auth | 5.2.4 | Built-in authentication system | Standard for User model and permission checking |
| logging | Python stdlib | Migration tracking and debugging | For logging migration progress and issues |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom data migrations | Third-party tools (django-safemigrate) | Tools add safety checks but custom migrations give full control |
| Role in ProjectAccess | Django Groups/Permissions | Groups/Permissions more complex, overkill for simple role-based access |
| Manual SQL | Django ORM in migrations | ORM easier to maintain but SQL more explicit |

**Installation:**
No additional packages needed - all tools are part of Django 5.2.4 core.

## Architecture Patterns

### Recommended Migration Structure
```
migrations/
├── 000X_add_role_to_projectaccess.py       # Schema change: add role field
├── 000X_migrate_profile_roles.py           # Data migration: copy role data
├── 000X_remove_profile_references.py       # Code deployed before this
└── 000X_delete_userprofile_models.py       # Model deletion with SeparateDatabaseAndState
```

### Pattern 1: Multi-Phase Model Removal
**What:** Separate code changes from schema changes to prevent deployment failures
**When to use:** Always when removing models that existing code references
**Example:**
```python
# Phase 1: Add new field and migrate data
class Migration(migrations.Migration):
    operations = [
        migrations.AddField(
            model_name='projectaccess',
            name='role',
            field=models.CharField(
                max_length=20,
                choices=ROLE_CHOICES,
                default='standard'
            ),
        ),
        migrations.RunPython(
            migrate_roles_forward,
            reverse_code=migrate_roles_reverse
        ),
    ]

# Phase 2 (separate deployment): Remove model safely
class Migration(migrations.Migration):
    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.DeleteModel(name='MaxilloUserProfile'),
            ],
            database_operations=[
                migrations.RunSQL(
                    "DROP TABLE IF EXISTS maxillo_maxillouserprofile;",
                    reverse_sql=migrations.RunSQL.noop
                )
            ]
        )
    ]
```

### Pattern 2: Historical Models in Data Migrations
**What:** Use apps.get_model() instead of importing models directly
**When to use:** Always in RunPython data migrations
**Example:**
```python
# Source: Django 5.2 Official Documentation
def migrate_roles_forward(apps, schema_editor):
    # Use historical models via apps.get_model()
    ProjectAccess = apps.get_model('common', 'ProjectAccess')
    MaxilloProfile = apps.get_model('maxillo', 'MaxilloUserProfile')

    for profile in MaxilloProfile.objects.all():
        ProjectAccess.objects.filter(user=profile.user).update(
            role=profile.role
        )

class Migration(migrations.Migration):
    dependencies = [
        ('common', '0001_initial'),
        ('maxillo', '0004_maxillouserprofile'),
    ]

    operations = [
        migrations.RunPython(
            migrate_roles_forward,
            reverse_code=migrate_roles_reverse
        ),
    ]
```

### Pattern 3: Centralized Permission Checking
**What:** Single function that checks ProjectAccess.role instead of scattered profile checks
**When to use:** All permission decisions throughout the application
**Example:**
```python
# Central permission checking utility
def check_permission(user, project, action):
    """Single source of truth for permission checks."""
    try:
        access = ProjectAccess.objects.get(user=user, project=project)

        if action == 'upload':
            return access.role in ['annotator', 'project_manager', 'admin', 'student_dev']
        elif action == 'delete':
            return access.role == 'admin'
        # ... other actions

    except ProjectAccess.DoesNotExist:
        return False

# Usage in views
@login_required
def upload_patient(request):
    project = get_current_project(request)
    if not check_permission(request.user, project, 'upload'):
        return HttpResponseForbidden()
    # ... upload logic
```

### Pattern 4: Middleware Refactoring
**What:** Replace ActiveProfileMiddleware with simpler role resolution from ProjectAccess
**When to use:** When middleware needs to attach permission context to requests
**Example:**
```python
class ProjectAccessMiddleware(MiddlewareMixin):
    """Attach project role to request for easy access."""

    def process_request(self, request):
        if not request.user.is_authenticated:
            return None

        project_id = request.session.get('current_project_id')
        if not project_id:
            return None

        try:
            access = ProjectAccess.objects.get(
                user=request.user,
                project_id=project_id
            )
            request.user_role = access.role
        except ProjectAccess.DoesNotExist:
            request.user_role = None

        return None
```

### Anti-Patterns to Avoid
- **Deleting models without SeparateDatabaseAndState:** Causes immediate table drop, breaking rollback deployments
- **Importing models directly in migrations:** Breaks when rerunning old migrations on fresh installs
- **Single-phase removal:** Code referencing old models breaks during rolling deployment window
- **Forgetting reverse migrations:** Makes rollback impossible when data corruption occurs
- **Removing signals before data migration completes:** Profile creation breaks for new users

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Safe model deletion | Custom DROP TABLE SQL | SeparateDatabaseAndState + DeleteModel | Handles Django state tracking, prevents broken rollbacks |
| Permission caching | Custom caching layer | Django's @cached_property or select_related | Built-in, tested, integrates with Django ORM |
| Migration rollback logic | Manual reverse functions | RunPython(forward, reverse_code=backward) | Django migration system handles order and dependencies |
| Cross-app migration dependencies | Manual migration ordering | dependencies = [('app', 'migration')] | Django enforces dependency order automatically |
| User role checking | Multiple if/else checks scattered in code | Centralized permission functions | Single source of truth prevents inconsistencies |

**Key insight:** Django's migration system is battle-tested for schema evolution. Custom solutions introduce edge cases Django already handles (dependency ordering, transaction management, state tracking, rollback safety).

## Common Pitfalls

### Pitfall 1: Signals Running During Data Migrations
**What goes wrong:** post_save signals that create profiles don't fire during data migrations, leaving some users without profiles
**Why it happens:** Django's historical models in migrations don't trigger signals to avoid side effects
**How to avoid:** Manually create missing profiles in data migration or temporarily disable signal during migration
**Warning signs:** New users created during migration window have no profile; DoesNotExist errors after migration

### Pitfall 2: Foreign Key Cascade on Profile Deletion
**What goes wrong:** If UserProfile has related objects with CASCADE, deleting profiles deletes related data
**Why it happens:** Django's default on_delete=CASCADE propagates deletions
**How to avoid:** Check for related objects before deletion; use SET_NULL or PROTECT if relationships exist
**Warning signs:** Data loss during migration testing; users complain of missing data

### Pitfall 3: Inconsistent Role Choices Between Models
**What goes wrong:** ROLE_CHOICES differs between MaxilloUserProfile and ProjectAccess, migration maps invalid roles
**Why it happens:** Models evolved independently, choices diverged over time
**How to avoid:** Audit all ROLE_CHOICES before migration; add validation in data migration
**Warning signs:** Migration crashes with IntegrityError; users have NULL roles after migration

### Pitfall 4: Middleware Cache Hits for Deleted Attributes
**What goes wrong:** Middleware tries to access request.user.profile after profiles removed, raises AttributeError
**Why it happens:** Cached middleware code or templates still reference old attributes
**How to avoid:** Update all middleware/templates before deploying profile deletion; grep codebase for "user.profile"
**Warning signs:** 500 errors after deployment; AttributeError in logs for missing profile attribute

### Pitfall 5: Rolling Deployment Window with Mixed Versions
**What goes wrong:** Old code queries deleted profile tables while new code expects ProjectAccess.role
**Why it happens:** Load balancer routes requests to both old and new app versions during deployment
**How to avoid:** Use SeparateDatabaseAndState to delay table drop; deploy in separate phases
**Warning signs:** Intermittent database errors during deployment; some requests work, others fail

### Pitfall 6: Missing ProjectAccess Entries
**What goes wrong:** Users have profiles but no ProjectAccess entries; migration doesn't create them
**Why it happens:** Assumed every user with profile has ProjectAccess, but some users only have profiles
**How to avoid:** Create ProjectAccess entries for all users during migration; don't assume 1:1 mapping
**Warning signs:** Users can't access projects after migration; "Access Denied" errors for previously-working users

### Pitfall 7: Template Variable References
**What goes wrong:** Templates still reference {{ user.profile.is_admin }} or {{ user.maxillo_profile.role }}
**Why it happens:** Templates not updated during code refactoring
**How to avoid:** Grep all templates for profile references; add custom template tag for permission checks
**Warning signs:** Template rendering errors; VariableDoesNotExist exceptions in production logs

## Code Examples

Verified patterns from official sources:

### Data Migration with Historical Models
```python
# Source: https://docs.djangoproject.com/en/5.2/topics/migrations/
from django.db import migrations

def migrate_roles_to_projectaccess(apps, schema_editor):
    """
    Migrate role data from UserProfile models to ProjectAccess.
    Uses historical models to ensure migration reproducibility.
    """
    ProjectAccess = apps.get_model('common', 'ProjectAccess')
    MaxilloProfile = apps.get_model('maxillo', 'MaxilloUserProfile')
    BrainProfile = apps.get_model('brain', 'BrainUserProfile')
    Project = apps.get_model('common', 'Project')

    # Get projects
    maxillo_project = Project.objects.get(name='Maxillo')
    brain_project = Project.objects.get(name='Brain')

    # Migrate Maxillo profiles
    for profile in MaxilloProfile.objects.all():
        ProjectAccess.objects.update_or_create(
            user=profile.user,
            project=maxillo_project,
            defaults={'role': profile.role}
        )

    # Migrate Brain profiles
    for profile in BrainProfile.objects.all():
        ProjectAccess.objects.update_or_create(
            user=profile.user,
            project=brain_project,
            defaults={'role': profile.role}
        )

def reverse_migration(apps, schema_editor):
    """Reverse: restore profile data from ProjectAccess."""
    ProjectAccess = apps.get_model('common', 'ProjectAccess')
    MaxilloProfile = apps.get_model('maxillo', 'MaxilloUserProfile')
    BrainProfile = apps.get_model('brain', 'BrainUserProfile')
    Project = apps.get_model('common', 'Project')

    maxillo_project = Project.objects.get(name='Maxillo')
    brain_project = Project.objects.get(name='Brain')

    # Restore Maxillo profiles
    for access in ProjectAccess.objects.filter(project=maxillo_project):
        MaxilloProfile.objects.update_or_create(
            user=access.user,
            defaults={'role': access.role}
        )

    # Restore Brain profiles
    for access in ProjectAccess.objects.filter(project=brain_project):
        BrainProfile.objects.update_or_create(
            user=access.user,
            defaults={'role': access.role}
        )

class Migration(migrations.Migration):
    dependencies = [
        ('common', '0001_add_role_to_projectaccess'),
        ('maxillo', '0004_maxillouserprofile'),
        ('brain', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(
            migrate_roles_to_projectaccess,
            reverse_code=reverse_migration
        ),
    ]
```

### Safe Model Deletion with SeparateDatabaseAndState
```python
# Source: https://docs.djangoproject.com/en/5.2/ref/migration-operations/
from django.db import migrations

class Migration(migrations.Migration):
    """
    Safe deletion of UserProfile models after code no longer references them.
    Uses SeparateDatabaseAndState to decouple state changes from schema changes.
    """
    dependencies = [
        ('maxillo', '0005_remove_all_profile_references'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            # State operations: tell Django the models are gone
            state_operations=[
                migrations.DeleteModel(name='MaxilloUserProfile'),
            ],
            # Database operations: actually drop the tables
            database_operations=[
                migrations.RunSQL(
                    sql="DROP TABLE IF EXISTS maxillo_maxillouserprofile;",
                    reverse_sql=migrations.RunSQL.noop
                ),
            ]
        ),
    ]
```

### Centralized Permission Utility
```python
# Pattern based on Django REST Framework permission patterns
# Source: https://www.django-rest-framework.org/api-guide/permissions/
from common.models import ProjectAccess

class PermissionChecker:
    """
    Single source of truth for all permission checks.
    Replaces scattered profile.can_* method calls.
    """

    UPLOAD_ROLES = ['annotator', 'project_manager', 'admin', 'student_dev']
    DELETE_ROLES = ['admin']
    MODIFY_ROLES = ['annotator', 'project_manager', 'admin']
    VIEW_DEBUG_ROLES = ['admin', 'student_dev']

    @classmethod
    def get_user_role(cls, user, project):
        """Get user's role for a specific project."""
        try:
            access = ProjectAccess.objects.get(user=user, project=project)
            return access.role
        except ProjectAccess.DoesNotExist:
            return None

    @classmethod
    def can_upload(cls, user, project):
        """Check if user can upload scans to project."""
        role = cls.get_user_role(user, project)
        return role in cls.UPLOAD_ROLES

    @classmethod
    def can_delete(cls, user, project):
        """Check if user can delete scans from project."""
        role = cls.get_user_role(user, project)
        return role in cls.DELETE_ROLES

    @classmethod
    def can_modify(cls, user, project):
        """Check if user can modify scan settings."""
        role = cls.get_user_role(user, project)
        return role in cls.MODIFY_ROLES

    @classmethod
    def can_view_debug(cls, user, project):
        """Check if user can see debug scans."""
        role = cls.get_user_role(user, project)
        return role in cls.VIEW_DEBUG_ROLES

# Usage in views
from maxillo.permissions import PermissionChecker

@login_required
def upload_patient(request):
    project = get_current_project(request)

    if not PermissionChecker.can_upload(request.user, project):
        messages.error(request, 'No permission to upload')
        return redirect('patient_list')

    # ... upload logic
```

### Middleware Simplification
```python
# Current code uses ActiveProfileMiddleware with multiple profiles
# Refactored version uses ProjectAccess directly
from django.utils.deprecation import MiddlewareMixin
from common.models import Project, ProjectAccess

class ProjectAccessMiddleware(MiddlewareMixin):
    """
    Simplified middleware that resolves user role from ProjectAccess.
    Replaces ActiveProfileMiddleware that managed multiple profile types.
    """

    def process_request(self, request):
        if not request.user.is_authenticated:
            return None

        # Get current project from session
        project_id = request.session.get('current_project_id')
        if not project_id:
            return None

        try:
            # Look up ProjectAccess for role
            access = ProjectAccess.objects.select_related('project').get(
                user=request.user,
                project_id=project_id
            )
            # Attach role to request for easy access
            request.user_role = access.role
            request.user_project_access = access
        except ProjectAccess.DoesNotExist:
            request.user_role = None
            request.user_project_access = None

        return None
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Separate UserProfile per app | Unified ProjectAccess.role | Django 3.2+ (2021) | Industry moved to project-based permissions vs app-based |
| Boolean permission fields | Role-based enum choices | RBAC standard practice | Cleaner, more maintainable permission logic |
| Middleware setting user.profile | Request-level permission checks | Modern Django patterns | Avoids N+1 queries, cleaner separation |
| Signals for profile creation | Explicit ProjectAccess creation | Django 4.0+ recommendations | More explicit, easier to debug |

**Deprecated/outdated:**
- **Multiple OneToOne profile models per user**: Modern Django apps use single user model with project-scoped permissions (ManyToMany through table with role field)
- **can_view/can_upload boolean fields**: Replaced by role-based checks; roles are more maintainable and extensible
- **ActiveProfileMiddleware pattern**: Setting `request.user.profile` dynamically is error-prone; better to query ProjectAccess when needed

## Open Questions

Things that couldn't be fully resolved:

1. **ProjectAccess entries for users without current access**
   - What we know: Some users may have MaxilloUserProfile but no ProjectAccess entry
   - What's unclear: Should migration create ProjectAccess entries for all users, or only those with explicit access?
   - Recommendation: Audit ProjectAccess and UserProfile tables before migration; create ProjectAccess entries for all profile users to preserve access

2. **Signal timing during migration deployment**
   - What we know: Signals don't run during data migrations
   - What's unclear: When to remove signals that create profiles (before or after model deletion)?
   - Recommendation: Remove signals in same commit as code changes that stop using profiles; deploy before table drop

3. **Template caching and profile references**
   - What we know: Templates may reference user.profile attributes
   - What's unclear: Full extent of template usage (especially in third-party packages or custom tags)
   - Recommendation: Add comprehensive grep for all profile references; create custom template filter for permission checks

4. **Invitation system role handling**
   - What we know: Invitation model has role field, creates profiles on signup
   - What's unclear: Should invitations create ProjectAccess entries directly, or is there intermediate step?
   - Recommendation: Update invitation acceptance flow to create ProjectAccess instead of profiles

## Sources

### Primary (HIGH confidence)
- [Django 5.2 Migrations Documentation](https://docs.djangoproject.com/en/5.2/topics/migrations/) - Data migration patterns with RunPython
- [Django 5.2 Migration Operations](https://docs.djangoproject.com/en/5.2/ref/migration-operations/) - SeparateDatabaseAndState and DeleteModel operations
- [Django REST Framework Permissions](https://www.django-rest-framework.org/api-guide/permissions/) - Role-based permission patterns
- [Django 5.2 Middleware](https://docs.djangoproject.com/en/5.2/ref/middleware/) - Middleware patterns and request.user handling

### Secondary (MEDIUM confidence)
- [Safe Django Migrations - PostHog Handbook](https://posthog.com/handbook/engineering/safe-django-migrations) - Multi-phase deployment patterns
- [Writing Safe Database Migrations in Django - Markus Holtermann](https://markusholtermann.eu/2021/06/writing-safe-database-migrations-in-django/) - Zero-downtime migration strategies
- [Safe Django Migrations - Loopwerk](https://www.loopwerk.io/articles/2025/safe-django-db-migrations/) - Two-phase deploy pattern
- [Django Signals - Django Antipatterns](https://www.django-antipatterns.com/antipattern/signals.html) - Signal issues in migrations
- [Role-Based Access Control in Django - Permit.io](https://www.permit.io/blog/how-to-implement-role-based-access-control-rbac-into-a-django-application) - RBAC implementation patterns
- [Implementing RBAC in Django - Permify](https://permify.co/post/rbac-in-django/) - Permission consolidation approaches
- [Django Code Cleanup Guide - Stackademic](https://blog.stackademic.com/django-code-cleanup-a-step-by-step-refactoring-guide-b9ea8dcd4689) - Refactoring patterns verified with 2025 content
- [Migrating to Django 5.2 LTS - Medium](https://medium.com/@anas-issath/migrating-to-django-5-2-what-changed-in-production-deployment-ac55e7717ebc) - Production deployment patterns for Django 5.2

### Tertiary (LOW confidence)
- [Django Refactoring Fat Models - SoftKraft](https://www.softkraft.co/django-best-practises/) - General refactoring guidance (not migration-specific)
- [Clean Architecture in Django - Mindbowser](https://www.mindbowser.com/clean-architecture-django-guide/) - Architecture patterns (general, not specific to this refactoring)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Django 5.2.4 is project's current version, all migrations use built-in tools
- Architecture: HIGH - Official Django docs and multiple verified sources agree on multi-phase pattern
- Pitfalls: MEDIUM - Based on documented issues and best practices, but not all specific to Django 5.2

**Research date:** 2026-01-26
**Valid until:** 2026-04-26 (90 days - Django stable release, patterns mature)
