"""
Centralized authorization utilities for ToothFairy application.

This module provides consistent authorization checks across the application
to prevent security vulnerabilities and ensure consistent access control.
"""

from django.http import JsonResponse
from django.shortcuts import redirect
from django.contrib import messages
from typing import Optional, Tuple
import logging

logger = logging.getLogger(__name__)


class AuthorizationResult:
    """Result of an authorization check."""
    
    def __init__(self, allowed: bool, reason: str = "", redirect_url: str = None):
        self.allowed = allowed
        self.reason = reason
        self.redirect_url = redirect_url
    
    def is_allowed(self) -> bool:
        return self.allowed
    
    def get_error_response(self, request=None):
        """Get appropriate error response based on request type."""
        if request and request.headers.get('Accept', '').startswith('application/json'):
            return JsonResponse({'error': self.reason}, status=403)
        else:
            if request:
                messages.error(request, self.reason)
            return redirect(self.redirect_url or '/login/')


def check_patient_access(user, patient, require_modify: bool = False) -> AuthorizationResult:
    """
    SECURITY: Centralized patient access control.
    
    Args:
        user: Django User object
        patient: Patient object to check access for
        require_modify: If True, requires modify permissions (admin/annotator only)
        
    Returns:
        AuthorizationResult with access decision
    """
    if not user.is_authenticated:
        return AuthorizationResult(False, "Authentication required", "/login/")
    
    if not hasattr(user, 'profile'):
        logger.warning(f"User {user.id} has no profile - denying access")
        return AuthorizationResult(False, "Invalid user profile")
    
    user_profile = user.profile
    
    # Check basic view permissions
    can_view = False
    if user_profile.is_admin():
        can_view = True
    elif user_profile.is_annotator() and patient.visibility != 'debug':
        can_view = True
    elif user_profile.is_student_developer() and patient.visibility == 'debug':
        can_view = True
    elif patient.visibility == 'public':
        can_view = True
    
    if not can_view:
        logger.warning(f"User {user.id} denied view access to patient {patient.patient_id}")
        return AuthorizationResult(False, "You do not have permission to view this patient")
    
    # Check modify permissions if required
    if require_modify:
        can_modify = False
        if user_profile.is_admin():
            can_modify = True
        elif user_profile.is_annotator() and patient.visibility != 'debug':
            can_modify = True
        elif user_profile.is_student_developer() and patient.visibility == 'debug':
            can_modify = True
        
        if not can_modify:
            logger.warning(f"User {user.id} denied modify access to patient {patient.patient_id}")
            return AuthorizationResult(False, "You do not have permission to modify this patient")
    
    return AuthorizationResult(True)


def check_project_access(user, project, require_admin: bool = False) -> AuthorizationResult:
    """
    SECURITY: Centralized project access control.
    
    Args:
        user: Django User object
        project: Project object to check access for
        require_admin: If True, requires admin permissions
        
    Returns:
        AuthorizationResult with access decision
    """
    if not user.is_authenticated:
        return AuthorizationResult(False, "Authentication required", "/login/")
    
    if not hasattr(user, 'profile'):
        logger.warning(f"User {user.id} has no profile - denying project access")
        return AuthorizationResult(False, "Invalid user profile")
    
    user_profile = user.profile
    
    # Admins have access to all projects
    if user_profile.is_admin():
        return AuthorizationResult(True)
    
    # Check project-specific access
    from maxillo.models import ProjectAccess
    has_access = ProjectAccess.objects.filter(
        user=user,
        project=project,
        can_view=True
    ).exists()
    
    if not has_access:
        logger.warning(f"User {user.id} denied project access to project {project.id}")
        return AuthorizationResult(False, "You do not have access to this project")
    
    # Check admin requirements
    if require_admin:
        has_admin_access = ProjectAccess.objects.filter(
            user=user,
            project=project,
            can_admin=True
        ).exists()
        
        if not has_admin_access:
            logger.warning(f"User {user.id} denied admin access to project {project.id}")
            return AuthorizationResult(False, "You do not have admin access to this project")
    
    return AuthorizationResult(True)


def check_file_access(user, file_obj) -> AuthorizationResult:
    """
    SECURITY: Centralized file access control.
    
    Args:
        user: Django User object
        file_obj: FileRegistry object to check access for
        
    Returns:
        AuthorizationResult with access decision
    """
    if not user.is_authenticated:
        return AuthorizationResult(False, "Authentication required", "/login/")
    
    if not hasattr(user, 'profile'):
        logger.warning(f"User {user.id} has no profile - denying file access")
        return AuthorizationResult(False, "Invalid user profile")
    
    # If file is not associated with a patient, only admins can access it
    if not file_obj.patient:
        user_profile = user.profile
        if not user_profile.is_admin():
            logger.warning(f"User {user.id} denied access to orphaned file {file_obj.id}")
            return AuthorizationResult(False, "Permission denied")
        return AuthorizationResult(True)
    
    # Check patient access
    patient_result = check_patient_access(user, file_obj.patient)
    if not patient_result.is_allowed():
        return patient_result
    
    # Check project access if patient belongs to a project
    if file_obj.patient.project:
        project_result = check_project_access(user, file_obj.patient.project)
        if not project_result.is_allowed():
            logger.warning(f"User {user.id} denied project access for file {file_obj.id}")
            return AuthorizationResult(False, "Project access denied")
    
    return AuthorizationResult(True)


def require_patient_access(require_modify: bool = False):
    """
    SECURITY: Decorator for views that require patient access.
    
    Args:
        require_modify: If True, requires modify permissions
        
    Usage:
        @require_patient_access(require_modify=True)
        def update_patient(request, patient_id):
            # View code here
    """
    def decorator(view_func):
        def wrapper(request, patient_id, *args, **kwargs):
            from maxillo.models import Patient
            
            try:
                patient = Patient.objects.get(patient_id=patient_id)
            except Patient.DoesNotExist:
                if request.headers.get('Accept', '').startswith('application/json'):
                    return JsonResponse({'error': 'Patient not found'}, status=404)
                else:
                    messages.error(request, 'Patient not found')
                    return redirect('patient_list')
            
            auth_result = check_patient_access(request.user, patient, require_modify)
            if not auth_result.is_allowed():
                return auth_result.get_error_response(request)
            
            # Add patient to kwargs for the view
            kwargs['patient'] = patient
            return view_func(request, patient_id, *args, **kwargs)
        
        return wrapper
    return decorator


def require_project_access(require_admin: bool = False):
    """
    SECURITY: Decorator for views that require project access.
    
    Args:
        require_admin: If True, requires admin permissions
        
    Usage:
        @require_project_access(require_admin=True)
        def admin_project_view(request, project_slug):
            # View code here
    """
    def decorator(view_func):
        def wrapper(request, project_slug, *args, **kwargs):
            from common.models import Project
            
            try:
                project = Project.objects.get(slug=project_slug)
            except Project.DoesNotExist:
                if request.headers.get('Accept', '').startswith('application/json'):
                    return JsonResponse({'error': 'Project not found'}, status=404)
                else:
                    messages.error(request, 'Project not found')
                    return redirect('home')
            
            auth_result = check_project_access(request.user, project, require_admin)
            if not auth_result.is_allowed():
                return auth_result.get_error_response(request)
            
            # Add project to kwargs for the view
            kwargs['project'] = project
            return view_func(request, project_slug, *args, **kwargs)
        
        return wrapper
    return decorator
