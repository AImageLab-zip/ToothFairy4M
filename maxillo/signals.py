from django.db.models.signals import post_save
from django.dispatch import receiver
from django.contrib.auth.models import User


# Profile creation signal REMOVED - roles now handled via ProjectAccess
# Users get ProjectAccess entries when:
# 1. They accept an invitation (which specifies project and role)
# 2. An admin manually grants access

@receiver(post_save, sender=User)
def setup_new_user(sender, instance, created, **kwargs):
    """
    Handle new user setup.
    Note: ProjectAccess entries are created via invitation acceptance,
    not automatically on user creation.
    """
    if created:
        # New users start without any project access
        # They need to use an invitation or be granted access by admin
        pass


# Staff status signal removed - staff status should be managed separately
# or based on ProjectAccess roles if needed in the future
