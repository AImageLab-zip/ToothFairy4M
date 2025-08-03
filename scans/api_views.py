from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from django.utils.decorators import method_decorator
from django.views import View
import json
import os
import logging
import traceback
from .models import ProcessingJob, FileRegistry
from .file_utils import get_pending_jobs_for_type, mark_job_completed, mark_job_failed

# Get logger for this module
logger = logging.getLogger(__name__)


@csrf_exempt
@require_http_methods(["GET"])
def get_pending_jobs(request, job_type):
    """
    API endpoint for Docker containers to get pending jobs
    URL: /api/processing/jobs/pending/<job_type>/
    """
    if job_type not in ['cbct', 'ios', 'audio']:
        return JsonResponse({'error': 'Invalid job type'}, status=400)
    
    try:
        jobs = get_pending_jobs_for_type(job_type)[:10]  # Limit to 10 jobs at a time
        
        jobs_data = []
        for job in jobs:
            job_data = {
                'id': job.id,
                'job_type': job.job_type,
                'status': job.status,
                'priority': job.priority,
                'input_file_path': job.input_file_path,
                'docker_image': job.docker_image,
                'docker_command': job.docker_command,
                'created_at': job.created_at.isoformat(),
                'retry_count': job.retry_count,
                'max_retries': job.max_retries,
            }
            
            # Add related object info
            if job.scanpair:
                job_data['scanpair_id'] = job.scanpair.scanpair_id
                job_data['patient_id'] = job.scanpair.patient.patient_id
            
            if job.voice_caption:
                job_data['voice_caption_id'] = job.voice_caption.id
                job_data['duration'] = job.voice_caption.duration
                job_data['modality'] = job.voice_caption.modality
            
            jobs_data.append(job_data)
        
        return JsonResponse({
            'success': True,
            'jobs': jobs_data,
            'count': len(jobs_data)
        })
        
    except Exception as e:
        logger.error(f"Error getting pending jobs for type {job_type}: {e}")
        logger.error(f"Full traceback: {traceback.format_exc()}")
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["POST"])
def mark_job_processing(request, job_id):
    """
    API endpoint to mark a job as being processed
    URL: /api/processing/jobs/<job_id>/processing/
    """
    try:
        job = ProcessingJob.objects.get(id=job_id)
        
        # Parse request data
        data = json.loads(request.body.decode('utf-8'))
        worker_id = data.get('worker_id', 'unknown')
        
        # Mark as processing
        job.mark_processing(worker_id)
        
        return JsonResponse({
            'success': True,
            'job_id': job.id,
            'status': job.status,
            'started_at': job.started_at.isoformat()
        })
        
    except ProcessingJob.DoesNotExist:
        logger.error(f"Job with ID {job_id} not found for processing.")
        return JsonResponse({'error': 'Job not found'}, status=404)
    except Exception as e:
        logger.error(f"Error marking job {job_id} as processing: {e}")
        logger.error(f"Full traceback: {traceback.format_exc()}")
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["POST"])
def mark_job_completed_api(request, job_id):
    """
    API endpoint to mark a job as completed
    URL: /api/processing/jobs/<job_id>/completed/
    """
    logger.info(f"Received job completion request for job_id={job_id}")
    logger.debug(f"Request body: {request.body.decode('utf-8')}")
    
    try:
        # Parse request data
        data = json.loads(request.body.decode('utf-8'))
        output_files = data.get('output_files', {})
        logs = data.get('logs', None)
        
        # Also check for transcription in other possible fields
        transcription = data.get('transcription', None)
        text = data.get('text', None)
        
        # Use the first available transcription source
        if logs and isinstance(logs, str) and logs.strip():
            transcription_text = logs
        elif transcription and isinstance(transcription, str) and transcription.strip():
            transcription_text = transcription
        elif text and isinstance(text, str) and text.strip():
            transcription_text = text
        else:
            transcription_text = "Error"
        
        success = mark_job_completed(job_id, output_files, transcription_text)
        
        if success:
            job = ProcessingJob.objects.get(id=job_id)
            return JsonResponse({
                'success': True,
                'job_id': job.id,
                'status': job.status,
                'completed_at': job.completed_at.isoformat() if job.completed_at else None,
                'output_files': job.output_files
            })
        else:
            logger.error(f"Job with ID {job_id} not found for completion.")
            return JsonResponse({'error': 'Job not found'}, status=404)
        
    except Exception as e:
        logger.error(f"Error marking job {job_id} as completed: {e}")
        logger.error(f"Full traceback: {traceback.format_exc()}")
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["POST"])
def mark_job_failed_api(request, job_id):
    """
    API endpoint to mark a job as failed
    URL: /api/processing/jobs/<job_id>/failed/
    """
    try:
        # Parse request data
        data = json.loads(request.body.decode('utf-8'))
        error_msg = data.get('error_msg', 'Unknown error')
        can_retry = data.get('can_retry', True)
        
        success = mark_job_failed(job_id, error_msg, can_retry)
        
        if success:
            job = ProcessingJob.objects.get(id=job_id)
            return JsonResponse({
                'success': True,
                'job_id': job.id,
                'status': job.status,
                'error_logs': job.error_logs,
                'retry_count': job.retry_count,
                'can_retry': job.can_retry()
            })
        else:
            logger.error(f"Job with ID {job_id} not found for failure.")
            return JsonResponse({'error': 'Job not found'}, status=404)
        
    except Exception as e:
        logger.error(f"Error marking job {job_id} as failed: {e}")
        logger.error(f"Full traceback: {traceback.format_exc()}")
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["GET"])
def get_job_status(request, job_id):
    """
    API endpoint to get job status
    URL: /api/processing/jobs/<job_id>/status/
    """
    try:
        job = ProcessingJob.objects.get(id=job_id)
        
        job_data = {
            'id': job.id,
            'job_type': job.job_type,
            'status': job.status,
            'priority': job.priority,
            'created_at': job.created_at.isoformat(),
            'started_at': job.started_at.isoformat() if job.started_at else None,
            'completed_at': job.completed_at.isoformat() if job.completed_at else None,
            'retry_count': job.retry_count,
            'max_retries': job.max_retries,
            'error_logs': job.error_logs,
            'worker_id': job.worker_id,
            'input_file_path': job.input_file_path,
            'output_files': job.output_files,
        }
        
        # Add related object info
        if job.scanpair:
            job_data['scanpair_id'] = job.scanpair.scanpair_id
            job_data['patient_id'] = job.scanpair.patient.patient_id
        
        if job.voice_caption:
            job_data['voice_caption_id'] = job.voice_caption.id
        
        return JsonResponse({
            'success': True,
            'job': job_data
        })
        
    except ProcessingJob.DoesNotExist:
        logger.error(f"Job with ID {job_id} not found for status check.")
        return JsonResponse({'error': 'Job not found'}, status=404)
    except Exception as e:
        logger.error(f"Error getting job status for {job_id}: {e}")
        logger.error(f"Full traceback: {traceback.format_exc()}")
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["GET"])
def health_check(request):
    """
    Simple health check endpoint
    URL: /api/processing/health/
    """
    try:
        # Check database connectivity
        pending_count = ProcessingJob.objects.filter(status='pending').count()
        processing_count = ProcessingJob.objects.filter(status='processing').count()
        
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
        logger.error(f"Full traceback: {traceback.format_exc()}")
        return JsonResponse({
            'success': False,
            'status': 'unhealthy',
            'error': str(e)
        }, status=500)


# Class-based views for more complex operations
@method_decorator(csrf_exempt, name='dispatch')
class ProcessingJobListView(View):
    """
    List/create processing jobs
    URL: /api/processing/jobs/
    """
    
    def get(self, request):
        """Get all jobs with filtering"""
        try:
            # Query parameters
            job_type = request.GET.get('job_type')
            status = request.GET.get('status')
            limit = int(request.GET.get('limit', 50))
            offset = int(request.GET.get('offset', 0))
            
            # Build query
            jobs = ProcessingJob.objects.all()
            
            if job_type:
                jobs = jobs.filter(job_type=job_type)
            if status:
                jobs = jobs.filter(status=status)
            
            # Apply pagination
            total_count = jobs.count()
            jobs = jobs[offset:offset + limit]
            
            jobs_data = []
            for job in jobs:
                job_data = {
                    'id': job.id,
                    'job_type': job.job_type,
                    'status': job.status,
                    'priority': job.priority,
                    'created_at': job.created_at.isoformat(),
                    'started_at': job.started_at.isoformat() if job.started_at else None,
                    'completed_at': job.completed_at.isoformat() if job.completed_at else None,
                    'retry_count': job.retry_count,
                    'worker_id': job.worker_id,
                }
                
                if job.scanpair:
                    job_data['scanpair_id'] = job.scanpair.scanpair_id
                if job.voice_caption:
                    job_data['voice_caption_id'] = job.voice_caption.id
                
                jobs_data.append(job_data)
            
            return JsonResponse({
                'success': True,
                'jobs': jobs_data,
                'pagination': {
                    'total_count': total_count,
                    'limit': limit,
                    'offset': offset,
                    'has_more': offset + limit < total_count
                }
            })
            
        except Exception as e:
            logger.error(f"Error listing processing jobs: {e}")
            logger.error(f"Full traceback: {traceback.format_exc()}")
            return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt  
@require_http_methods(["GET"])
def serve_file(request, file_id):
    """
    Serve files from FileRegistry by ID
    URL: /api/processing/files/serve/<file_id>/
    """
    from django.http import FileResponse, Http404
    import mimetypes
    
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
        scanpair_id = request.GET.get('scanpair_id')
        limit = int(request.GET.get('limit', 50))
        offset = int(request.GET.get('offset', 0))
        
        # Build query
        files = FileRegistry.objects.all()
        
        if file_type:
            files = files.filter(file_type=file_type)
        if scanpair_id:
            files = files.filter(scanpair__scanpair_id=scanpair_id)
        
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
            
            if file_obj.scanpair:
                file_data['scanpair_id'] = file_obj.scanpair.scanpair_id
                file_data['patient_id'] = file_obj.scanpair.patient.patient_id
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