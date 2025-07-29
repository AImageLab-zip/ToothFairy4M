from django.db.models.signals import post_save
from django.dispatch import receiver
from django.contrib.auth.models import User
from .models import UserProfile, ScanPair
from .processing import execute_ios_processing_command, execute_cbct_processing_command


@receiver(post_save, sender=User)
def create_user_profile(sender, instance, created, **kwargs):
    if created:
        UserProfile.objects.create(user=instance)


@receiver(post_save, sender=ScanPair)
def trigger_processing_pipeline(sender, instance, created, **kwargs):
    if created:
        # Trigger processing in background (in production, use Celery or similar)
        try:
            # Process IOS scans if available
            if instance.has_ios_scans():
                execute_ios_processing_command(instance)
            
            # Process CBCT if available  
            if instance.has_cbct_scan():
                execute_cbct_processing_command(instance)
                
        except Exception as e:
            print(f"Error in processing pipeline for ScanPair {instance.scanpair_id}: {e}") 