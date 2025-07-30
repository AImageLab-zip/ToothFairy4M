import logging
import time
import json
from django.utils.deprecation import MiddlewareMixin

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
        import traceback
        logger.error(f"Full traceback: {traceback.format_exc()}")
        return None 