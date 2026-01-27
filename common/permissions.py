"""
Centralized permission checking utility.
Single source of truth for all permission decisions based on ProjectAccess.role.
"""
from common.models import ProjectAccess
import logging

logger = logging.getLogger(__name__)


def get_user_project_access(user, project):
    """
    Get ProjectAccess for a user and project.
    Returns None if no access exists.

    This is used by code outside request context.
    In views, use request.user.profile (set by middleware).
    """
    if not user or not user.is_authenticated:
        return None
    if not project:
        return None

    try:
        return ProjectAccess.objects.select_related('project').get(
            user=user,
            project=project
        )
    except ProjectAccess.DoesNotExist:
        return None


def get_user_role(user, project):
    """Get user's role for a specific project."""
    access = get_user_project_access(user, project)
    return access.role if access else None


class PermissionChecker:
    """
    Permission checking utility that wraps ProjectAccess.

    USE CASE: Background tasks, management commands, utility functions
    that need to check permissions outside of a web request context.

    VIEWS: Don't use this - use request.user.profile (set by middleware).
    The middleware sets user.profile = ProjectAccess, so views can call
    user.profile.is_admin() directly.
    """

    def __init__(self, user, project):
        self.user = user
        self.project = project
        self._access = None
        self._loaded = False

    @property
    def access(self):
        """Lazy load ProjectAccess."""
        if not self._loaded:
            self._access = get_user_project_access(self.user, self.project)
            self._loaded = True
        return self._access

    @property
    def role(self):
        """Get user's role for the project."""
        return self.access.role if self.access else None

    def is_annotator(self):
        return self.access.is_annotator() if self.access else False

    def is_project_manager(self):
        return self.access.is_project_manager() if self.access else False

    def is_admin(self):
        return self.access.is_admin() if self.access else False

    def is_student_developer(self):
        return self.access.is_student_developer() if self.access else False

    def can_upload_scans(self):
        return self.access.can_upload_scans() if self.access else False

    def can_see_debug_scans(self):
        return self.access.can_see_debug_scans() if self.access else False

    def can_see_public_private_scans(self):
        return self.access.can_see_public_private_scans() if self.access else False

    def can_modify_scan_settings(self):
        return self.access.can_modify_scan_settings() if self.access else False

    def can_delete_scans(self):
        return self.access.can_delete_scans() if self.access else False

    def can_delete_debug_scans(self):
        return self.access.can_delete_debug_scans() if self.access else False

    def can_view_other_profiles(self):
        return self.access.can_view_other_profiles() if self.access else False

    def get_role_display(self):
        return self.access.get_role_display() if self.access else 'No Access'
