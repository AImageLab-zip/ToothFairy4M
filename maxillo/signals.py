from django.contrib.auth.models import User
from django.db.models.signals import post_save
from django.dispatch import receiver


@receiver(post_save, sender=User)
def setup_new_user(sender, instance, created, **kwargs):
    """Users are provisioned through ProjectAccess and invitations."""
    if created:
        pass
