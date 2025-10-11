"""Patient data API endpoints for serving scan data."""
from django.shortcuts import get_object_or_404
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse, HttpResponse
import os
import logging

from ..models import Patient

logger = logging.getLogger(__name__)

def patient_viewer_data(request, patient_id):
    """API endpoint to provide scan data for 3D viewer"""
    scan_pair = get_object_or_404(Patient, patient_id=patient_id)
    user_profile = request.user.profile
    
    can_view = False
    if user_profile.is_admin():
        can_view = True
    elif user_profile.is_annotator() and scan_pair.visibility != 'debug':
        can_view = True
    elif user_profile.is_student_developer() and scan_pair.visibility == 'debug':
        can_view = True
    elif scan_pair.visibility == 'public':
        can_view = True
    
    if not can_view:
        return JsonResponse({'error': 'Permission denied'}, status=403)
    
    # Determine modality status using Jobs (use 'ios' modality slug from request context or default)
    modality_slug = 'ios'  # This endpoint specifically serves IOS data
    try:
        from common.models import Job as _Job
        if _Job.objects.filter(patient=scan_pair, modality_slug=modality_slug, status='processing').exists():
            return JsonResponse({
                'error': f'{modality_slug.upper()} scans are still being processed',
                'status': 'processing',
                'message': 'The scans are being processed. This may take a few minutes.'
            }, status=202)
        if _Job.objects.filter(patient=scan_pair, modality_slug=modality_slug, status='failed').exists():
            return JsonResponse({
                'error': f'{modality_slug.upper()} processing failed',
                'status': 'failed',
                'message': 'The scan processing failed. Please try uploading again or contact support.'
            }, status=500)
    except Exception:
        pass
    
    # Try to get scan URLs from FileRegistry
    upper_scan_url = None
    lower_scan_url = None
    
    # Check FileRegistry for processed files first, then raw files
    try:
        # Look for processed files first
        processed_files = scan_pair.get_ios_processed_files()
        if processed_files['upper'] and processed_files['lower']:
            upper_scan_url = f'/api/processing/files/serve/{processed_files["upper"].id}/'
            lower_scan_url = f'/api/processing/files/serve/{processed_files["lower"].id}/'
        else:
            # Fallback to raw files from FileRegistry
            raw_files = scan_pair.get_ios_raw_files()
            if raw_files['upper'] and raw_files['lower']:
                upper_scan_url = f'/api/processing/files/serve/{raw_files["upper"].id}/'
                lower_scan_url = f'/api/processing/files/serve/{raw_files["lower"].id}/'
    except Exception:
        pass
    
    if not upper_scan_url or not lower_scan_url:
        return JsonResponse({
            'error': 'No IOS scan data available',
            'status': 'not_found'
        }, status=404)
    
    # Ensure URLs use HTTPS if the request came over HTTPS
    def build_secure_uri(request, url):
        # Check if request is secure (either direct HTTPS or behind proxy)
        is_secure = request.is_secure() or request.META.get('HTTP_X_FORWARDED_PROTO') == 'https'
        
        # Always use HTTPS if the request is secure, regardless of the original URL
        if is_secure:
            if url.startswith('/'):
                # Relative URL - build absolute URL with HTTPS
                return f'https://{request.get_host()}{url}'
            elif url.startswith('http://'):
                # HTTP URL - convert to HTTPS
                return url.replace('http://', 'https://', 1)
            elif url.startswith('https://'):
                # Already HTTPS - return as-is
                return url
            else:
                # Any other case - assume it's a relative URL and make it HTTPS
                return f'https://{request.get_host()}/{url.lstrip("/")}'
        else:
            # For non-secure requests, use standard build_absolute_uri
            return request.build_absolute_uri(url)
    
    is_secure = request.is_secure() or request.META.get('HTTP_X_FORWARDED_PROTO') == 'https'
    logger.debug(
        f"Request secure: {request.is_secure()}, X-Forwarded-Proto: {request.META.get('HTTP_X_FORWARDED_PROTO')}, is_secure: {is_secure}"
    )
    logger.debug(f"Original URLs - upper: {upper_scan_url}, lower: {lower_scan_url}")
    
    upper_url = build_secure_uri(request, upper_scan_url)
    lower_url = build_secure_uri(request, lower_scan_url)
    
    logger.debug(f"Final URLs - upper: {upper_url}, lower: {lower_url}")
    
    data = {
        'upper_scan_url': upper_url,
        'lower_scan_url': lower_url,
        'patient_info': {
            'patient_id': scan_pair.patient_id,
        }
    }
    
    return JsonResponse(data)


def patient_cbct_data(request, patient_id):
    """API endpoint to serve CBCT data"""
    import os
    
    scan_pair = get_object_or_404(Patient, patient_id=patient_id)
    user_profile = request.user.profile
    
    # Check permissions based on scan visibility and user role
    can_view = False
    if user_profile.is_admin():
        can_view = True
    elif user_profile.is_annotator() and scan_pair.visibility != 'debug':
        can_view = True
    elif user_profile.is_student_developer() and scan_pair.visibility == 'debug':
        can_view = True
    elif scan_pair.visibility == 'public':
        can_view = True
    
    if not can_view:
        return JsonResponse({'error': 'Permission denied'}, status=403)
    
    # Determine modality status using Jobs (use 'cbct' modality slug for this endpoint)
    modality_slug = 'cbct'  # This endpoint specifically serves CBCT data
    try:
        from common.models import Job as _Job
        if _Job.objects.filter(patient=scan_pair, modality_slug=modality_slug, status='processing').exists():
            return JsonResponse({
                'error': f'{modality_slug.upper()} is still being processed',
                'status': 'processing',
                'message': 'The volume is being converted to NIfTI format. This may take a few minutes.'
            }, status=202)
        if _Job.objects.filter(patient=scan_pair, modality_slug=modality_slug, status='failed').exists():
            return JsonResponse({
                'error': f'{modality_slug.upper()} processing failed',
                'status': 'failed',
                'message': 'The volume processing failed. Please try uploading again or contact support.'
            }, status=500)
    except Exception:
        pass
    
    # Get CBCT file path - prioritize converted .nii.gz from processed files
    file_path = None
    
    # First, check for processed CBCT (converted .nii.gz)
    try:
        processed_entry = scan_pair.files.filter(file_type='cbct_processed').first()
        if processed_entry:
            if processed_entry.file_hash == 'multi-file' and 'files' in processed_entry.metadata:
                # New structure: look for converted volume in metadata
                files_data = processed_entry.metadata.get('files', {})
                volume_data = files_data.get('volume_nifti', {})
                volume_path = volume_data.get('path')
                if volume_path and os.path.exists(volume_path):
                    file_path = volume_path
    except:
        pass
    
    # Fallback to raw CBCT if no processed version available
    if not file_path:
        try:
            # Check FileRegistry for raw CBCT
            raw_cbct = scan_pair.get_cbct_raw_file()
            if raw_cbct and os.path.exists(raw_cbct.file_path):
                # Only use raw file if it's already in .nii.gz format
                if raw_cbct.file_path.endswith('.nii.gz'):
                    file_path = raw_cbct.file_path
        except:
            pass
    
    if not file_path or not os.path.exists(file_path):
        return JsonResponse({
            'error': 'No CBCT data available',
            'status': 'not_found'
        }, status=404)
    
    try:
        # Just read and send the file as-is, whether it's compressed or not
        with open(file_path, 'rb') as f:
            data = f.read()
            response = HttpResponse(data, content_type='application/octet-stream')
            response['Content-Disposition'] = f'attachment; filename="cbct_{patient_id}.nii.gz"'
            return response
                
    except Exception as e:
        logger.error(f"Error serving CBCT data: {e}", exc_info=True)
        return JsonResponse({'error': f'Failed to load CBCT data: {str(e)}'}, status=500)


def patient_volume_data(request, patient_id, modality_slug):
    """Generic API endpoint to serve NIfTI volume for arbitrary modality (no panoramic).

    Strategy:
    - Prefer processed entry with volume_nifti in metadata for (patient, modality)
    - Fallback to latest FileRegistry entry for (patient, modality) that endswith .nii or .nii.gz
    """
    import os
    scan_pair = get_object_or_404(Patient, patient_id=patient_id)
    user_profile = request.user.profile
    # Basic permission checks (same as CBCT)
    can_view = False
    if user_profile.is_admin() or scan_pair.visibility == 'public':
        can_view = True
    elif user_profile.is_annotator() and scan_pair.visibility != 'debug':
        can_view = True
    elif user_profile.is_student_developer() and scan_pair.visibility == 'debug':
        can_view = True
    if not can_view:
        return JsonResponse({'error': 'Permission denied'}, status=403)
    try:
        from common.models import FileRegistry as _FR
    except Exception:
        return JsonResponse({'error': 'File registry unavailable'}, status=500)
    # Try processed entry first
    file_path = None
    try:
        processed = _FR.objects.filter(patient=scan_pair, modality__slug=modality_slug, file_type='cbct_processed').first()
        if processed and processed.file_hash == 'multi-file' and 'files' in processed.metadata:
            files_data = processed.metadata.get('files', {})
            nifti = files_data.get('volume_nifti', {})
            vol_path = nifti.get('path')
            if vol_path and os.path.exists(vol_path):
                file_path = vol_path
    except Exception:
        pass
    # Fallback: use the latest raw NIfTI
    if not file_path:
        try:
            raw = _FR.objects.filter(patient=scan_pair, modality__slug=modality_slug).order_by('-created_at').first()
            if raw and raw.file_path and (raw.file_path.endswith('.nii') or raw.file_path.endswith('.nii.gz')) and os.path.exists(raw.file_path):
                file_path = raw.file_path
        except Exception:
            pass
    if not file_path:
        return JsonResponse({'error': f'No volume data for {modality_slug}'}, status=404)
    try:
        with open(file_path, 'rb') as f:
            data = f.read()
            response = HttpResponse(data, content_type='application/octet-stream')
            response['Content-Disposition'] = f'attachment; filename="{modality_slug}_{patient_id}.nii.gz"'
            return response
    except Exception as e:
        return JsonResponse({'error': f'Failed to load volume: {e}'}, status=500)


def patient_panoramic_data(request, patient_id):
    """API endpoint to serve panoramic image data
    
    Priority:
    1. If patient has panoramic modality uploaded -> serve that
    2. Otherwise, if patient has CBCT -> serve CBCT-generated panoramic
    """
    
    scan_pair = get_object_or_404(Patient, patient_id=patient_id)
    user_profile = request.user.profile
    
    # Check permissions based on scan visibility and user role
    can_view = False
    if user_profile.is_admin():
        can_view = True
    elif user_profile.is_annotator() and scan_pair.visibility != 'debug':
        can_view = True
    elif user_profile.is_student_developer() and scan_pair.visibility == 'debug':
        can_view = True
    elif scan_pair.visibility == 'public':
        can_view = True
    
    if not can_view:
        return JsonResponse({'error': 'Permission denied'}, status=403)
    
    # PRIORITY 1: Check for uploaded panoramic modality file
    try:
        from common.models import FileRegistry
        # Look for panoramic files by modality slug OR file_type
        # Try modality-based lookup first
        panoramic_file = scan_pair.files.filter(
            modality__slug='panoramic'
        ).order_by('-created_at').first()
        
        # If not found, try file_type lookup (for files uploaded before modality system)
        if not panoramic_file:
            panoramic_file = scan_pair.files.filter(
                file_type='panoramic_raw'
            ).order_by('-created_at').first()
        
        # Also check processed panoramic
        if not panoramic_file:
            panoramic_file = scan_pair.files.filter(
                file_type='panoramic_processed'
            ).order_by('-created_at').first()
        
        if panoramic_file and os.path.exists(panoramic_file.file_path):
            logger.debug(f"Serving uploaded panoramic file: {panoramic_file.file_path}")
            # Determine content type based on file extension
            file_ext = os.path.splitext(panoramic_file.file_path)[1].lower()
            content_type = 'image/png'
            if file_ext in ['.jpg', '.jpeg']:
                content_type = 'image/jpeg'
            elif file_ext == '.gif':
                content_type = 'image/gif'
            elif file_ext == '.webp':
                content_type = 'image/webp'
            
            # Serve the uploaded panoramic image
            with open(panoramic_file.file_path, 'rb') as f:
                data = f.read()
                response = HttpResponse(data, content_type=content_type)
                response['Content-Disposition'] = f'inline; filename="panoramic_{patient_id}{file_ext}"'
                return response
    except Exception as e:
        logger.warning(f"Error checking for uploaded panoramic file: {e}")
    
    # PRIORITY 2: Fall back to CBCT-generated panoramic image
    logger.debug("No uploaded panoramic file found, checking for CBCT-generated panoramic")
    
    # Check if CBCT exists but is still processing
    if scan_pair.has_cbct_scan() and scan_pair.cbct_processing_status == 'processing':
        return JsonResponse({
            'error': 'CBCT is still being processed',
            'status': 'processing',
            'message': 'The panoramic view will be available once CBCT processing is complete.'
        }, status=202)
    
    # Check if processing failed
    if scan_pair.has_cbct_scan() and scan_pair.cbct_processing_status == 'failed':
        return JsonResponse({
            'error': 'CBCT processing failed',
            'status': 'failed',
            'message': 'The CBCT processing failed. Panoramic view is not available.'
        }, status=500)
    
    # Check if CBCT processing is complete (panoramic is only available after processing)
    logger.debug(f"CBCT processing status: {scan_pair.cbct_processing_status}")
    logger.debug(f"is_cbct_processed(): {scan_pair.is_cbct_processed()}")
    if not scan_pair.is_cbct_processed():
        return JsonResponse({
            'error': 'CBCT processing not complete',
            'status': 'not_processed',
            'message': 'Panoramic view not available yet'
        }, status=404)
    
    # Look for panoramic file in FileRegistry (CBCT Processed files)
    try:
        # Find the CBCT processed file entry for this scan pair
        processed_entry = scan_pair.files.filter(file_type='cbct_processed').first()
        
        if not processed_entry:
            return JsonResponse({'error': 'Processed CBCT files not found'}, status=404)
        
        # Check if using new multi-file structure
        panoramic_path = None
        if processed_entry.file_hash == 'multi-file' and 'files' in processed_entry.metadata:
            # New structure: multiple files in metadata
            files_data = processed_entry.metadata.get('files', {})
            logger.debug(f"files_data keys: {list(files_data.keys())}")
            pano_data = files_data.get('panoramic_view', {})
            logger.debug(f"pano_data: {pano_data}")
            panoramic_path = pano_data.get('path')
            logger.debug(f"panoramic_path: {panoramic_path}")
        else:
            # Legacy structure: single file path (backward compatibility)
            if processed_entry.file_path.endswith('_pano.png'):
                panoramic_path = processed_entry.file_path
        
        if not panoramic_path:
            logger.debug(f"panoramic_path ({panoramic_path=}) is None or empty")
            return JsonResponse({'error': 'Panoramic image not found in processed files'}, status=404)
        
        logger.debug(f"Checking if file exists: {panoramic_path}")
        if not os.path.exists(panoramic_path):
            logger.debug(f"File does not exist on disk: {panoramic_path}")
            return JsonResponse({'error': 'Panoramic image file not found on disk'}, status=404)
        logger.debug(f"File exists on disk: {panoramic_path}")
        
        # Serve the panoramic image
        with open(panoramic_path, 'rb') as f:
            data = f.read()
            response = HttpResponse(data, content_type='image/png')
            response['Content-Disposition'] = f'inline; filename="panoramic_{patient_id}.png"'
            return response
                
    except Exception as e:
        logger.error(f"Error serving panoramic data: {e}", exc_info=True)
        return JsonResponse({'error': 'Internal server error'}, status=500)


def patient_intraoral_data(request, patient_id):
    """API endpoint to serve intraoral photographs data"""
    
    scan_pair = get_object_or_404(Patient, patient_id=patient_id)
    user_profile = request.user.profile
    
    # Check permissions based on scan visibility and user role
    can_view = False
    if user_profile.is_admin():
        can_view = True
    elif user_profile.is_annotator() and scan_pair.visibility != 'debug':
        can_view = True
    elif user_profile.is_student_developer() and scan_pair.visibility == 'debug':
        can_view = True
    elif scan_pair.visibility == 'public':
        can_view = True
    
    if not can_view:
        return JsonResponse({'error': 'Permission denied'}, status=403)
    
    # Get intraoral images from FileRegistry
    try:
        intraoral_files = scan_pair.files.filter(
            file_type__in=['intraoral_raw', 'intraoral_processed']
        ).order_by('metadata__image_index', 'created_at')
        
        if not intraoral_files.exists():
            return JsonResponse({'error': 'No intraoral photographs found'}, status=404)
        
        images_data = []
        for file_obj in intraoral_files:
            if os.path.exists(file_obj.file_path):
                images_data.append({
                    'id': file_obj.id,
                    'index': file_obj.metadata.get('image_index', 0),
                    'original_filename': file_obj.metadata.get('original_filename', ''),
                    'is_processed': file_obj.file_type.endswith('_processed'),
                    'url': f'/api/processing/files/serve/{file_obj.id}/'
                })
        
        if not images_data:
            return JsonResponse({'error': 'No intraoral image files found on disk'}, status=404)
        
        return JsonResponse({
            'images': images_data,
            'count': len(images_data)
        })
                
    except Exception as e:
        logger.error(f"Error serving intraoral data: {e}", exc_info=True)
        return JsonResponse({'error': 'Internal server error'}, status=500)


def patient_teleradiography_data(request, patient_id):
    """API endpoint to serve teleradiography image data"""
    
    scan_pair = get_object_or_404(Patient, patient_id=patient_id)
    user_profile = request.user.profile
    
    # Check permissions based on scan visibility and user role
    can_view = False
    if user_profile.is_admin():
        can_view = True
    elif user_profile.is_annotator() and scan_pair.visibility != 'debug':
        can_view = True
    elif user_profile.is_student_developer() and scan_pair.visibility == 'debug':
        can_view = True
    elif scan_pair.visibility == 'public':
        can_view = True
    
    if not can_view:
        return JsonResponse({'error': 'Permission denied'}, status=403)
    
    # Look for teleradiography file in FileRegistry
    try:
        # Prefer processed file, fallback to raw
        teleradiography_file = scan_pair.files.filter(
            file_type='teleradiography_processed'
        ).first()
        
        if not teleradiography_file:
            teleradiography_file = scan_pair.files.filter(
                file_type='teleradiography_raw'
            ).first()
        
        if not teleradiography_file:
            return JsonResponse({'error': 'Teleradiography image not found'}, status=404)
        
        if not os.path.exists(teleradiography_file.file_path):
            return JsonResponse({'error': 'Teleradiography image file not found on disk'}, status=404)
        
        # Determine content type
        file_ext = os.path.splitext(teleradiography_file.file_path)[1].lower()
        content_type = 'image/jpeg' if file_ext in ['.jpg', '.jpeg'] else 'image/png'
        
        # Serve the teleradiography image
        with open(teleradiography_file.file_path, 'rb') as f:
            data = f.read()
            response = HttpResponse(data, content_type=content_type)
            response['Content-Disposition'] = f'inline; filename="teleradiography_{patient_id}{file_ext}"'
            return response
                
    except Exception as e:
        logger.error(f"Error serving teleradiography data: {e}", exc_info=True)
        return JsonResponse({'error': 'Internal server error'}, status=500)




