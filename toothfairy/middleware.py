import logging
import time
import json
from brain.models import BrainUserProfile
from common.models import Project
from django.utils.deprecation import MiddlewareMixin
import traceback
from django.shortcuts import redirect
from maxillo.models import MaxilloUserProfile

logger = logging.getLogger(__name__)


class RequestLoggingMiddleware(MiddlewareMixin):
    """
    Middleware to log all requests and responses for debugging purposes.
    """
    
    def process_request(self, request):
        """Log incoming request details"""
        request.start_time = time.time()
        
        # Log request details
        logger.info(f"Request: {request.method} {request.path}")
        logger.debug(f"Request headers: {dict(request.headers)}")
        
        # Log request body for POST/PUT requests (but be careful with sensitive data)
        if request.method in ['POST', 'PUT', 'PATCH']:
            try:
                body = request.body.decode('utf-8')
                if body:
                    # Truncate long bodies to avoid log spam
                    if len(body) > 1000:
                        body = body[:1000] + "... [truncated]"
                    logger.debug(f"Request body: {body}")
            except Exception as e:
                logger.debug(f"Could not decode request body: {e}")
    
    def process_response(self, request, response):
        """Log response details"""
        if hasattr(request, 'start_time'):
            duration = time.time() - request.start_time
            logger.info(f"Response: {request.method} {request.path} - {response.status_code} ({duration:.3f}s)")
        else:
            logger.info(f"Response: {request.method} {request.path} - {response.status_code}")
        
        # Log response details for errors
        if response.status_code >= 400:
            logger.warning(f"Error response for {request.method} {request.path}: {response.status_code}")
            if hasattr(response, 'content'):
                try:
                    content = response.content.decode('utf-8')
                    if len(content) > 500:
                        content = content[:500] + "... [truncated]"
                    logger.warning(f"Error response content: {content}")
                except Exception as e:
                    logger.warning(f"Could not decode error response content: {e}")
        
        return response
    
    def process_exception(self, request, exception):
        """Log unhandled exceptions"""
        logger.error(f"Unhandled exception for {request.method} {request.path}: {exception}")
        logger.error(f"Exception type: {type(exception).__name__}")
        logger.error(f"Full traceback: {traceback.format_exc()}")
        return None 


class ProjectSessionMiddleware(MiddlewareMixin):
    """
    Middleware to automatically set the project session based on URL path
    if not present in the session.
    """
    
    def process_request(self, request):
        """Set project session based on URL path"""
        if not request.user.is_authenticated:
            return None
        if request.session.get('current_project_id'):
            return None
        if not request.path.startswith('/'):
            return None

        url_start = request.path.split('/')[1]
        if url_start not in ['maxillo', 'brain']:
            return None

        project = Project.objects.get(name=url_start)
        request.session['current_project_id'] = project.id
        
        return None


class ActiveProfileMiddleware(MiddlewareMixin):
    """
    Middleware that sets `request.user.profile` to the correct profile object
    depending on which app namespace the request is for (e.g. 'maxillo' or 'brain').
    This makes template and view code that uses `user.profile` app-agnostic.

    If the appropriate profile object doesn't exist yet, it will be created with
    the default role.
    """
    def process_request(self, request):
        # Only operate for authenticated users
        if not hasattr(request, 'user') or not request.user.is_authenticated:
            return None

        path_parts = [p for p in request.path.split('/') if p]
        
        if not path_parts or len(path_parts) == 0:
            return None
        
        app_key = path_parts[0]

        if app_key not in ['maxillo', 'brain']:
            return None
        
        project_profile_classes = {
            'maxillo': MaxilloUserProfile,
            'brain': BrainUserProfile,
        }
        ProjectProfileClass = project_profile_classes[app_key]
        if hasattr(request.user, 'profile') and isinstance(request.user.profile, ProjectProfileClass):
            return None

        try:
            if app_key == 'maxillo' and hasattr(request.user, 'maxillo_profile'):
                request.user.profile = request.user.maxillo_profile
            elif app_key == 'brain' and hasattr(request.user, 'brain_profile'):
                request.user.profile = request.user.brain_profile
            else:
                logger.debug(f"Couldnt set user.profile for user {request.user.id} in app '{app_key}'")
                logger.debug(f"{request.user.__dict__=}")
                raise Exception(f"User {request.user.id} has no profile for app '{app_key}'")
        except Exception as e:
            logger.debug(f"ActiveProfileMiddleware: Exception getting profile for user {request.user.id} in app '{app_key}': {e}")
            return redirect('/')

        return None