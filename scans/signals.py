from django.db.models.signals import post_save
from django.dispatch import receiver
from django.contrib.auth.models import User
from .models import UserProfile, ScanPair
from .processing import execute_ios_processing_command, execute_cbct_processing_command


@receiver(post_save, sender=User)
def create_user_profile(sender, instance, created, **kwargs):
    if created:
        UserProfile.objects.create(user=instance)


# Legacy processing pipeline removed - processing now handled by external Docker containers
# that poll the ProcessingJob queue

# @receiver(post_save, sender=ScanPair)
# def trigger_processing_pipeline(sender, instance, created, **kwargs):
#     # Processing now handled by external Docker containers polling the database
#     pass 