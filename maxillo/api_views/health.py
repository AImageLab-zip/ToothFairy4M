"""Health check API endpoint."""
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from django.conf import settings
import os
import logging
from common.models import Job

logger = logging.getLogger(__name__)


@csrf_exempt
@require_http_methods(["GET"])
def health_check(request):
    """
    Simple health check endpoint
    URL: /api/processing/health/
    """
    try:
        # Check database connectivity
        pending_count = Job.objects.filter(status='pending').count()
        processing_count = Job.objects.filter(status='processing').count()
        
        return JsonResponse({
            'success': True,
            'status': 'healthy',
            'pending_jobs': pending_count,
            'processing_jobs': processing_count,
            'dataset_dir_exists': os.path.exists(settings.DATASET_PATH),
            'dataset_raw_dir_exists': os.path.exists(os.path.join(settings.DATASET_PATH, 'raw')),
            'dataset_processed_dir_exists': os.path.exists(os.path.join(settings.DATASET_PATH, 'processed'))
        })
        
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        import traceback
        logger.error(f"Full traceback: {traceback.format_exc()}")
        return JsonResponse({
            'success': False,
            'status': 'unhealthy',
            'error': str(e)
        }, status=500)

