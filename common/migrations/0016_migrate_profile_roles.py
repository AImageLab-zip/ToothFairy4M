from django.db import migrations


def migrate_roles_forward(apps, schema_editor):
    """
    Migrate role data from UserProfile models to ProjectAccess.
    Uses historical models via apps.get_model() for migration safety.
    """
    ProjectAccess = apps.get_model('common', 'ProjectAccess')
    Project = apps.get_model('common', 'Project')
    MaxilloProfile = apps.get_model('maxillo', 'MaxilloUserProfile')
    BrainProfile = apps.get_model('brain', 'BrainUserProfile')

    # Get projects by slug (case-insensitive)
    maxillo_project = Project.objects.filter(slug__iexact='maxillo').first()
    brain_project = Project.objects.filter(slug__iexact='brain').first()

    migrated_count = 0
    created_count = 0

    # Migrate Maxillo profiles
    if maxillo_project:
        for profile in MaxilloProfile.objects.all():
            access, created = ProjectAccess.objects.update_or_create(
                user=profile.user,
                project=maxillo_project,
                defaults={'role': profile.role}
            )
            if created:
                created_count += 1
            else:
                migrated_count += 1

    # Migrate Brain profiles
    if brain_project:
        for profile in BrainProfile.objects.all():
            access, created = ProjectAccess.objects.update_or_create(
                user=profile.user,
                project=brain_project,
                defaults={'role': profile.role}
            )
            if created:
                created_count += 1
            else:
                migrated_count += 1

    print(f"Role migration complete: {migrated_count} updated, {created_count} created")


def migrate_roles_reverse(apps, schema_editor):
    """
    Reverse migration: restore profile data from ProjectAccess.
    Note: This only updates existing profiles, doesn't recreate deleted ones.
    """
    ProjectAccess = apps.get_model('common', 'ProjectAccess')
    Project = apps.get_model('common', 'Project')
    MaxilloProfile = apps.get_model('maxillo', 'MaxilloUserProfile')
    BrainProfile = apps.get_model('brain', 'BrainUserProfile')

    maxillo_project = Project.objects.filter(slug__iexact='maxillo').first()
    brain_project = Project.objects.filter(slug__iexact='brain').first()

    # Restore Maxillo profiles
    if maxillo_project:
        for access in ProjectAccess.objects.filter(project=maxillo_project):
            MaxilloProfile.objects.filter(user=access.user).update(role=access.role)

    # Restore Brain profiles
    if brain_project:
        for access in ProjectAccess.objects.filter(project=brain_project):
            BrainProfile.objects.filter(user=access.user).update(role=access.role)


class Migration(migrations.Migration):
    dependencies = [
        ('common', '0015_add_role_to_projectaccess'),
        ('maxillo', '0005_alter_maxillouserprofile_options'),
        ('brain', '0002_alter_brainuserprofile_options'),
    ]

    operations = [
        migrations.RunPython(
            migrate_roles_forward,
            reverse_code=migrate_roles_reverse
        ),
    ]
