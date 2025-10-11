"""File serving and registry API endpoints."""
from django.http import JsonResponse, FileResponse, Http404
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
import os
import logging
import traceback
import mimetypes
from common.models import FileRegistry

logger = logging.getLogger(__name__)


@csrf_exempt  
@require_http_methods(["GET"])
def serve_file(request, file_id):
    """
    Serve files from FileRegistry by ID
    URL: /api/processing/files/serve/<file_id>/
    """
    try:
        file_obj = FileRegistry.objects.get(id=file_id)
        
        # Check if file exists
        if not os.path.exists(file_obj.file_path):
            raise Http404("File not found on disk")
        
        # Determine content type
        content_type, _ = mimetypes.guess_type(file_obj.file_path)
        if not content_type:
            if file_obj.file_type.startswith('cbct'):
                content_type = 'application/octet-stream'
            elif file_obj.file_type.startswith('ios'):
                content_type = 'model/stl'
            elif file_obj.file_type.startswith('audio'):
                content_type = 'audio/webm'
            else:
                content_type = 'application/octet-stream'
        
        # Generate filename
        filename = os.path.basename(file_obj.file_path)
        
        # Return file response - let Django handle file opening/closing
        try:
            file_handle = open(file_obj.file_path, 'rb')
            response = FileResponse(
                file_handle,
                content_type=content_type,
                filename=filename
            )
            response['Content-Disposition'] = f'inline; filename="{filename}"'
            return response
        except IOError as e:
            logger.error(f"IOError serving file {file_id}: {e}")
            raise Http404("File cannot be read")
        
    except FileRegistry.DoesNotExist:
        logger.error(f"File with ID {file_id} not found in registry.")
        raise Http404("File not found in registry")
    except Exception as e:
        logger.error(f"Error serving file {file_id}: {e}")
        logger.error(f"Full traceback: {traceback.format_exc()}")
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["GET"])
def get_file_registry(request):
    """
    API endpoint to get file registry information
    URL: /api/processing/files/
    """
    try:
        # Query parameters
        file_type = request.GET.get('file_type')
        patient_id = request.GET.get('patient_id')
        limit = int(request.GET.get('limit', 50))
        offset = int(request.GET.get('offset', 0))
        
        # Build query
        files = FileRegistry.objects.all()
        
        if file_type:
            files = files.filter(file_type=file_type)
        if patient_id:
            files = files.filter(patient__patient_id=patient_id)
        
        # Apply pagination
        total_count = files.count()
        files = files[offset:offset + limit]
        
        files_data = []
        for file_obj in files:
            file_data = {
                'id': file_obj.id,
                'file_type': file_obj.file_type,
                'file_path': file_obj.file_path,
                'file_size': file_obj.file_size,
                'file_hash': file_obj.file_hash,
                'created_at': file_obj.created_at.isoformat(),
                'metadata': file_obj.metadata,
            }
            
            if getattr(file_obj, 'patient_id', None):
                file_data['patient_id'] = file_obj.patient_id
            if file_obj.voice_caption:
                file_data['voice_caption_id'] = file_obj.voice_caption.id
            if file_obj.processing_job:
                file_data['processing_job_id'] = file_obj.processing_job.id
            
            files_data.append(file_data)
        
        return JsonResponse({
            'success': True,
            'files': files_data,
            'pagination': {
                'total_count': total_count,
                'limit': limit,
                'offset': offset,
                'has_more': offset + limit < total_count
            }
        })
        
    except Exception as e:
        logger.error(f"Error getting file registry: {e}")
        logger.error(f"Full traceback: {traceback.format_exc()}")
        return JsonResponse({'error': str(e)}, status=500)

