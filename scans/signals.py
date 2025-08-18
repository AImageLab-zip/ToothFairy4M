from django.db.models.signals import post_save
from django.dispatch import receiver
from django.contrib.auth.models import User
from .models import UserProfile, ScanPair
from .processing import execute_ios_processing_command, execute_cbct_processing_command


@receiver(post_save, sender=User)
def create_user_profile(sender, instance, created, **kwargs):
    if created:
        UserProfile.objects.create(user=instance)


@receiver(post_save, sender=UserProfile)
def update_user_staff_status(sender, instance, created, **kwargs):
    """Update User's is_staff flag based on UserProfile role"""
    user = instance.user
    
    # Student developers and admins should have staff access
    should_be_staff = instance.role in ['admin', 'student_dev']
    
    if user.is_staff != should_be_staff:
        user.is_staff = should_be_staff
        user.save()
    
    # For Student Developers, we need to ensure they have at least view permissions
    if instance.role == 'student_dev':
        from django.contrib.auth.models import Permission
        from django.contrib.contenttypes.models import ContentType
        
        # Get all view permissions for our models
        content_types = ContentType.objects.filter(
            app_label='scans',
            model__in=['userprofile', 'dataset', 'patient', 'scanpair', 'classification', 
                      'voicecaption', 'processingjob', 'fileregistry', 'invitation']
        )
        
        view_permissions = Permission.objects.filter(
            content_type__in=content_types,
            codename__startswith='view_'
        )
        
        # Add view permissions to the user
        user.user_permissions.set(view_permissions)