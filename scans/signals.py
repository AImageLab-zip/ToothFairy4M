from django.db.models.signals import post_save
from django.dispatch import receiver
from django.contrib.auth.models import User
from .models import UserProfile, ScanPair
from .processing import process_scan_pair


@receiver(post_save, sender=User)
def create_user_profile(sender, instance, created, **kwargs):
    if created:
        UserProfile.objects.create(user=instance)


@receiver(post_save, sender=ScanPair)
def trigger_processing_pipeline(sender, instance, created, **kwargs):
    if created and instance.upper_scan_raw and instance.lower_scan_raw:
        # Trigger processing in background (in production, use Celery or similar)
        try:
            process_scan_pair(instance)
        except Exception as e:
            print(f"Error in processing pipeline for ScanPair {instance.scanpair_id}: {e}") 