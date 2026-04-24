"""Patient data API endpoints for serving scan data."""
from django.shortcuts import get_object_or_404
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse, HttpResponse
from django.urls import reverse
import os
import logging
import cv2
import numpy as np
import json
from .domain import get_domain_models

logger = logging.getLogger(__name__)


def _serve_file_url(request, file_id):
    namespace = (getattr(request, 'resolver_match', None) and request.resolver_match.namespace) or 'maxillo'
    return reverse(f'{namespace}:api_serve_file', kwargs={'file_id': file_id})

@login_required
def patient_viewer_data(request, patient_id):
    """API endpoint to provide scan data for 3D viewer"""
    Patient = get_domain_models(request)['Patient']
    patient = get_object_or_404(Patient, patient_id=patient_id)
    domain = 'brain' if (getattr(request, 'resolver_match', None) and request.resolver_match.namespace == 'brain') else 'maxillo'
    user_profile = request.user.profile
    
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
        return JsonResponse({'error': 'Permission denied'}, status=403)
    
    # Determine modality status using Jobs (use 'ios' modality slug from request context or default)
    modality_slug = 'ios'  # This endpoint specifically serves IOS data
    try:
        from common.models import Job as _Job
        job_filter = {'domain': domain, 'modality_slug': modality_slug, 'status': 'processing'}
        if domain == 'brain':
            job_filter['brain_patient_id'] = patient.patient_id
        else:
            job_filter['patient_id'] = patient.patient_id
        if _Job.objects.filter(**job_filter).exists():
            return JsonResponse({
                'error': f'{modality_slug.upper()} scans are still being processed',
                'status': 'processing',
                'message': 'The scans are being processed. This may take a few minutes.'
            }, status=202)
        failed_filter = {'domain': domain, 'modality_slug': modality_slug, 'status': 'failed'}
        if domain == 'brain':
            failed_filter['brain_patient_id'] = patient.patient_id
        else:
            failed_filter['patient_id'] = patient.patient_id
        if _Job.objects.filter(**failed_filter).exists():
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
        processed_files = patient.get_ios_processed_files()
        if processed_files['upper'] and processed_files['lower']:
            upper_scan_url = _serve_file_url(request, processed_files['upper'].id)
            lower_scan_url = _serve_file_url(request, processed_files['lower'].id)
        else:
            # Fallback to raw files from FileRegistry
            raw_files = patient.get_ios_raw_files()
            if raw_files['upper'] and raw_files['lower']:
                upper_scan_url = _serve_file_url(request, raw_files['upper'].id)
                lower_scan_url = _serve_file_url(request, raw_files['lower'].id)
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
            'patient_id': patient.patient_id,
        }
    }
    
    return JsonResponse(data)


@login_required
def patient_cbct_data(request, patient_id):
    """API endpoint to serve CBCT data"""
    import os
    
    Patient = get_domain_models(request)['Patient']
    patient = get_object_or_404(Patient, patient_id=patient_id)
    domain = 'brain' if (getattr(request, 'resolver_match', None) and request.resolver_match.namespace == 'brain') else 'maxillo'
    user_profile = request.user.profile
    
    # Check permissions based on scan visibility and user role
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
        return JsonResponse({'error': 'Permission denied'}, status=403)
    
    # Determine modality status using Jobs (use 'cbct' modality slug for this endpoint)
    modality_slug = 'cbct'  # This endpoint specifically serves CBCT data
    try:
        from common.models import Job as _Job
        job_filter = {'domain': domain, 'modality_slug': modality_slug, 'status': 'processing'}
        if domain == 'brain':
            job_filter['brain_patient_id'] = patient.patient_id
        else:
            job_filter['patient_id'] = patient.patient_id
        if _Job.objects.filter(**job_filter).exists():
            return JsonResponse({
                'error': f'{modality_slug.upper()} is still being processed',
                'status': 'processing',
                'message': 'The volume is being converted to NIfTI format. This may take a few minutes.'
            }, status=202)
        failed_filter = {'domain': domain, 'modality_slug': modality_slug, 'status': 'failed'}
        if domain == 'brain':
            failed_filter['brain_patient_id'] = patient.patient_id
        else:
            failed_filter['patient_id'] = patient.patient_id
        if _Job.objects.filter(**failed_filter).exists():
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
        processed_entry = patient.files.filter(file_type='cbct_processed').first()
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
            # Do not rely on get_cbct_raw_file() because legacy data may contain
            # multiple cbct_raw rows (including non-NIfTI files).
            raw_entries = patient.files.filter(file_type='cbct_raw').order_by('-created_at')
            for raw_entry in raw_entries:
                raw_path = raw_entry.file_path
                if not raw_path:
                    continue
                if (raw_path.endswith('.nii') or raw_path.endswith('.nii.gz')) and os.path.exists(raw_path):
                    file_path = raw_path
                    break
        except Exception:
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


@login_required
def patient_volume_data(request, patient_id, modality_slug):
    """Generic API endpoint to serve NIfTI volume for arbitrary modality (no panoramic).

    Strategy:
    - Prefer processed entry with volume_nifti in metadata for (patient, modality)
    - Fallback to latest FileRegistry entry for (patient, modality) that endswith .nii or .nii.gz
    """
    import os
    Patient = get_domain_models(request)['Patient']
    patient = get_object_or_404(Patient, patient_id=patient_id)
    domain = 'brain' if (getattr(request, 'resolver_match', None) and request.resolver_match.namespace == 'brain') else 'maxillo'
    user_profile = request.user.profile
    # Basic permission checks (same as CBCT)
    can_view = False
    if user_profile.is_admin() or patient.visibility == 'public':
        can_view = True
    elif user_profile.is_annotator() and patient.visibility != 'debug':
        can_view = True
    elif user_profile.is_student_developer() and patient.visibility == 'debug':
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
        processed_filter = {'domain': domain, 'modality__slug': modality_slug, 'file_type': 'cbct_processed'}
        if domain == 'brain':
            processed_filter['brain_patient_id'] = patient.patient_id
        else:
            processed_filter['patient_id'] = patient.patient_id
        processed = _FR.objects.filter(**processed_filter).first()
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
            raw_filter = {'domain': domain, 'modality__slug': modality_slug}
            if domain == 'brain':
                raw_filter['brain_patient_id'] = patient.patient_id
            else:
                raw_filter['patient_id'] = patient.patient_id
            raw = _FR.objects.filter(**raw_filter).order_by('-created_at').first()
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


@login_required
def patient_panoramic_data(request, patient_id):
    """API endpoint to serve panoramic image data
    
    Priority:
    1. If patient has panoramic modality uploaded -> serve that
    2. Otherwise, if patient has CBCT -> serve CBCT-generated panoramic
    """
    
    Patient = get_domain_models(request)['Patient']
    patient = get_object_or_404(Patient, patient_id=patient_id)
    user_profile = request.user.profile
    
    # Check permissions based on scan visibility and user role
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
        return JsonResponse({'error': 'Permission denied'}, status=403)
    
    # PRIORITY 1: Check for uploaded panoramic modality file
    try:
        from common.models import FileRegistry
        # Look for panoramic files by modality slug OR file_type
        # Try modality-based lookup first
        panoramic_file = patient.files.filter(
            modality__slug='panoramic'
        ).order_by('-created_at').first()
        
        # If not found, try file_type lookup (for files uploaded before modality system)
        if not panoramic_file:
            panoramic_file = patient.files.filter(
                file_type='panoramic_raw'
            ).order_by('-created_at').first()
        
        # Also check processed panoramic
        if not panoramic_file:
            panoramic_file = patient.files.filter(
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
    if patient.has_cbct_scan() and patient.cbct_processing_status == 'processing':
        return JsonResponse({
            'error': 'CBCT is still being processed',
            'status': 'processing',
            'message': 'The panoramic view will be available once CBCT processing is complete.'
        }, status=202)
    
    # Check if processing failed
    if patient.has_cbct_scan() and patient.cbct_processing_status == 'failed':
        return JsonResponse({
            'error': 'CBCT processing failed',
            'status': 'failed',
            'message': 'The CBCT processing failed. Panoramic view is not available.'
        }, status=500)
    
    # Check if CBCT processing is complete (panoramic is only available after processing)
    logger.debug(f"CBCT processing status: {patient.cbct_processing_status}")
    logger.debug(f"is_cbct_processed(): {patient.is_cbct_processed()}")
    if not patient.is_cbct_processed():
        return JsonResponse({
            'error': 'CBCT processing not complete',
            'status': 'not_processed',
            'message': 'Panoramic view not available yet'
        }, status=404)
    
    # Look for panoramic file in FileRegistry (CBCT Processed files)
    try:
        # Find the CBCT processed file entry for this scan pair
        processed_entry = patient.files.filter(file_type='cbct_processed').first()
        
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


@login_required
@login_required
def patient_intraoral_data(request, patient_id):
    """API endpoint to serve intraoral photographs data.

    Default:
    - return only original intraoral photos

    Optional query params:
    - include_masks=1  -> include masks too
    - masks_only=1     -> return only masks
    """
    Patient = get_domain_models(request)['Patient']
    patient = get_object_or_404(Patient, patient_id=patient_id)
    user_profile = request.user.profile

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
        return JsonResponse({'error': 'Permission denied'}, status=403)

    include_masks = request.GET.get('include_masks', '0') in ('1', 'true', 'True')
    masks_only = request.GET.get('masks_only', '0') in ('1', 'true', 'True')

    try:
        all_intraoral_files = patient.files.filter(
            file_type__in=['intraoral_raw', 'intraoral_processed']
        ).order_by('metadata__image_index', 'created_at')

        filtered_files = []
        for file_obj in all_intraoral_files:
            metadata = file_obj.metadata or {}
            filename = os.path.basename(file_obj.file_path or '').lower()

            is_mask = bool(metadata.get('is_mask', False))
            is_color = bool(metadata.get('is_color_mask', False))
            is_json = bool(metadata.get('is_json', False))
            kind = metadata.get('kind', '')

            # fallback from filename if old metadata is incomplete
            if not is_mask and (kind == 'mask' or '_mask' in filename):
                is_mask = True

            if not is_color and (kind == 'color' or filename.endswith('_color.png')):
                is_color = True

            if not is_json and (kind == 'json' or filename.endswith('_json.json') or filename.endswith('.json')):
                is_json = True

            if masks_only:
                if is_mask:
                    filtered_files.append(file_obj)
            else:
                if include_masks:
                    if not is_color and not is_json:
                        filtered_files.append(file_obj)
                else:
                    if not is_mask and not is_color and not is_json:
                        filtered_files.append(file_obj)

        if not filtered_files:
            return JsonResponse({'error': 'No intraoral photographs found'}, status=404)

        images_data = []
        for file_obj in filtered_files:
            if os.path.exists(file_obj.file_path):
                metadata = file_obj.metadata or {}
                filename = os.path.basename(file_obj.file_path or '').lower()

                is_mask = bool(metadata.get('is_mask', False))
                is_color = bool(metadata.get('is_color_mask', False))
                is_json = bool(metadata.get('is_json', False))

                if not is_mask and (metadata.get('kind') == 'mask' or '_mask' in filename):
                    is_mask = True
                if not is_color and (metadata.get('kind') == 'color' or filename.endswith('_color.png')):
                    is_color = True
                if not is_json and (metadata.get('kind') == 'json' or filename.endswith('_json.json') or filename.endswith('.json')):
                    is_json = True

                images_data.append({
                    'id': file_obj.id,
                    'index': metadata.get('image_index', 0),
                    'original_filename': metadata.get('saved_filename', os.path.basename(file_obj.file_path)),
                    'filename': os.path.basename(file_obj.file_path),
                    'is_processed': file_obj.file_type.endswith('_processed'),
                    'is_mask': is_mask,
                    'is_color': is_color,
                    'is_json': is_json,
                    'url': _serve_file_url(request, file_obj.id)
                })

        if not images_data:
            return JsonResponse({'error': 'No intraoral image files found on disk'}, status=404)

        return JsonResponse({
            'images': images_data,
            'count': len(images_data),
            'include_masks': include_masks,
            'masks_only': masks_only,
        })

    except Exception as e:
        logger.error(f"Error serving intraoral data: {e}", exc_info=True)
        return JsonResponse({'error': 'Internal server error'}, status=500)


@login_required
def patient_teleradiography_data(request, patient_id):
    """API endpoint to serve teleradiography image data"""
    
    Patient = get_domain_models(request)['Patient']
    patient = get_object_or_404(Patient, patient_id=patient_id)
    user_profile = request.user.profile
    
    # Check permissions based on scan visibility and user role
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
        return JsonResponse({'error': 'Permission denied'}, status=403)
    
    # Look for teleradiography file in FileRegistry
    try:
        # Prefer processed file, fallback to raw
        teleradiography_file = patient.files.filter(
            file_type='teleradiography_processed'
        ).first()
        
        if not teleradiography_file:
            teleradiography_file = patient.files.filter(
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

"""Segmentation"""

from django.core.cache import cache
import re


def _load_segmentation_json(json_path):
    if not json_path or not os.path.exists(json_path):
        return None

    try:
        mtime = os.path.getmtime(json_path)
    except Exception:
        mtime = 0

    cache_key = f"seg_json:{json_path}:{mtime}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    try:
        with open(json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        cache.set(cache_key, data, timeout=3600)
        return data
    except Exception as e:
        logger.warning(f"Failed to load segmentation JSON {json_path}: {e}", exc_info=True)
        return None


def _extract_component_regions(mask_path):
    """
    Extract connected regions from grayscale instance mask.
    One connected component becomes one candidate region.
    """
    if not mask_path or not os.path.exists(mask_path):
        return []

    try:
        mtime = os.path.getmtime(mask_path)
    except Exception:
        mtime = 0

    cache_key = f"mask_regions:{mask_path}:{mtime}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    mask = cv2.imread(mask_path, cv2.IMREAD_GRAYSCALE)
    if mask is None:
        return []

    regions = []
    unique_values = np.unique(mask)
    unique_values = [int(v) for v in unique_values if int(v) > 0]

    for value in sorted(unique_values):
        binary = np.uint8(mask == value) * 255

        num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(
            binary,
            connectivity=8
        )

        for label_idx in range(1, num_labels):
            area = int(stats[label_idx, cv2.CC_STAT_AREA])
            if area < 20:
                continue

            x = int(stats[label_idx, cv2.CC_STAT_LEFT])
            y = int(stats[label_idx, cv2.CC_STAT_TOP])
            w = int(stats[label_idx, cv2.CC_STAT_WIDTH])
            h = int(stats[label_idx, cv2.CC_STAT_HEIGHT])

            cx, cy = centroids[label_idx]
            cx = float(cx)
            cy = float(cy)

            component_mask = np.uint8(labels == label_idx) * 255

            contours, _ = cv2.findContours(
                component_mask,
                cv2.RETR_EXTERNAL,
                cv2.CHAIN_APPROX_SIMPLE
            )

            if not contours:
                continue

            contour = max(contours, key=cv2.contourArea)
            epsilon = 0.002 * cv2.arcLength(contour, True)
            approx = cv2.approxPolyDP(contour, epsilon, True)
            contour_points = approx[:, 0, :].tolist()

            regions.append({
                'value': value,
                'bbox': [x, y, w, h],
                'area': float(area),
                'cx': cx,
                'cy': cy,
                'contour': contour_points,
            })

    cache.set(cache_key, regions, timeout=3600)
    return regions


def _bbox_iou(box_a, box_b):
    """
    box_a: [x, y, w, h]
    box_b: [x_min, y_min, x_max, y_max]
    """
    ax1, ay1, aw, ah = box_a
    ax2, ay2 = ax1 + aw, ay1 + ah

    bx1, by1, bx2, by2 = box_b

    inter_x1 = max(ax1, bx1)
    inter_y1 = max(ay1, by1)
    inter_x2 = min(ax2, bx2)
    inter_y2 = min(ay2, by2)

    inter_w = max(0, inter_x2 - inter_x1)
    inter_h = max(0, inter_y2 - inter_y1)
    inter_area = inter_w * inter_h

    area_a = max(1, aw * ah)
    area_b = max(1, (bx2 - bx1) * (by2 - by1))
    union_area = area_a + area_b - inter_area

    return inter_area / union_area if union_area > 0 else 0.0


def _safe_int(value, default=0):
    try:
        return int(value)
    except Exception:
        return default


def _safe_float(value, default=0.0):
    try:
        return float(value)
    except Exception:
        return default


def _json_to_teeth(json_data):
    teeth = (json_data or {}).get('teeth', [])
    normalized = []

    for tooth in teeth:
        normalized.append({
            'appearance_idx': _safe_int(tooth.get('appearance_idx'), 9999),
            'fdi': str(tooth.get('FDI_NUM', '')).strip(),
            'class_name': tooth.get('class_name', 'tooth'),
            'color': tooth.get('color'),
            'pixel_area': _safe_float(tooth.get('pixel_area'), 0.0),
            'x_min': _safe_int(tooth.get('x_min'), 0),
            'y_min': _safe_int(tooth.get('y_min'), 0),
            'x_max': _safe_int(tooth.get('x_max'), 0),
            'y_max': _safe_int(tooth.get('y_max'), 0),
            'centroid_x': _safe_float(tooth.get('centroid_x'), 0.0),
            'centroid_y': _safe_float(tooth.get('centroid_y'), 0.0),
            'arch': tooth.get('arch'),
            'contour_count': _safe_int(tooth.get('contour_count'), 0),
        })

    normalized.sort(key=lambda t: t['appearance_idx'])
    return normalized


def _build_json_only_annotations(json_data):
    teeth = _json_to_teeth(json_data)
    annotations = []

    for tooth in teeth:
        annotations.append({
            'fdi': tooth['fdi'],
            'color': tooth['color'],
            'appearance_idx': tooth['appearance_idx'],
            'arch': tooth['arch'],
            'cx': tooth['centroid_x'],
            'cy': tooth['centroid_y'],
            'bbox': [
                tooth['x_min'],
                tooth['y_min'],
                max(0, tooth['x_max'] - tooth['x_min']),
                max(0, tooth['y_max'] - tooth['y_min']),
            ],
            'json_bbox': [
                tooth['x_min'],
                tooth['y_min'],
                tooth['x_max'],
                tooth['y_max'],
            ],
            'area': tooth['pixel_area'],
            'pixel_area': tooth['pixel_area'],
            'contour': [],
            'source': 'json_only',
        })

    return annotations


def _match_json_teeth_to_mask(mask_path, json_data):
    """
    JSON-first matching:
    - JSON defines tooth identity, color, FDI, centroid, bbox, order
    - mask only provides shape when a safe match exists
    """
    teeth = _json_to_teeth(json_data)
    if not teeth:
        return []

    regions = _extract_component_regions(mask_path)
    if not regions:
        return _build_json_only_annotations(json_data)

    unmatched_regions = regions[:]
    matched = []

    for tooth in teeth:
        tx = tooth['centroid_x']
        ty = tooth['centroid_y']
        tarea = tooth['pixel_area']
        tbbox = [tooth['x_min'], tooth['y_min'], tooth['x_max'], tooth['y_max']]

        best_region = None
        best_score = None

        for region in unmatched_regions:
            dx = region['cx'] - tx
            dy = region['cy'] - ty
            dist2 = dx * dx + dy * dy

            area_penalty = abs(region['area'] - tarea) / max(tarea, 1.0)
            iou = _bbox_iou(region['bbox'], tbbox)

            score = dist2 + (area_penalty * 40000.0) - (iou * 30000.0)

            if best_score is None or score < best_score:
                best_score = score
                best_region = region

        chosen_region = None
        if best_region is not None:
            dx = best_region['cx'] - tx
            dy = best_region['cy'] - ty
            dist = (dx * dx + dy * dy) ** 0.5
            iou = _bbox_iou(best_region['bbox'], tbbox)

            if dist < 180 or iou > 0.20:
                chosen_region = best_region

        if chosen_region is not None:
            unmatched_regions.remove(chosen_region)
            matched.append({
                'fdi': tooth['fdi'],
                'color': tooth['color'],
                'appearance_idx': tooth['appearance_idx'],
                'arch': tooth['arch'],
                'cx': tx,
                'cy': ty,
                'bbox': chosen_region['bbox'],
                'json_bbox': tbbox,
                'area': chosen_region['area'],
                'pixel_area': tooth['pixel_area'],
                'contour': chosen_region['contour'],
                'source': 'mask+json',
            })
        else:
            matched.append({
                'fdi': tooth['fdi'],
                'color': tooth['color'],
                'appearance_idx': tooth['appearance_idx'],
                'arch': tooth['arch'],
                'cx': tx,
                'cy': ty,
                'bbox': [
                    tooth['x_min'],
                    tooth['y_min'],
                    max(0, tooth['x_max'] - tooth['x_min']),
                    max(0, tooth['y_max'] - tooth['y_min']),
                ],
                'json_bbox': tbbox,
                'area': tooth['pixel_area'],
                'pixel_area': tooth['pixel_area'],
                'contour': [],
                'source': 'json_only',
            })

    return matched


def _get_cached_annotations(mask_path, json_path, json_data):
    if not json_data:
        return []

    try:
        json_mtime = os.path.getmtime(json_path) if json_path and os.path.exists(json_path) else 0
    except Exception:
        json_mtime = 0

    try:
        mask_mtime = os.path.getmtime(mask_path) if mask_path and os.path.exists(mask_path) else 0
    except Exception:
        mask_mtime = 0

    cache_key = f"seg_annotations:{json_path}:{json_mtime}:{mask_path}:{mask_mtime}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    if mask_path and os.path.exists(mask_path):
        annotations = _match_json_teeth_to_mask(mask_path, json_data)
    else:
        annotations = _build_json_only_annotations(json_data)

    cache.set(cache_key, annotations, timeout=3600)
    return annotations


def _classify_intraoral_file(file_obj):
    file_path = file_obj.file_path
    metadata = file_obj.metadata or {}
    filename = os.path.basename(file_path or '')
    filename_lower = filename.lower()

    image_index = metadata.get('image_index')
    if image_index is None:
        match = re.search(r'intraoral_(\d+)_patient_', filename_lower)
        if match:
            image_index = int(match.group(1))

    kind = metadata.get('kind', '')
    is_mask = bool(metadata.get('is_mask', False))
    is_color = bool(metadata.get('is_color_mask', False))
    is_json = bool(metadata.get('is_json', False))

    if not is_mask and (kind == 'mask' or '_mask' in filename_lower):
        is_mask = True

    if not is_color and (kind == 'color' or filename_lower.endswith('_color.png')):
        is_color = True

    if not is_json and (kind == 'json' or filename_lower.endswith('_json.json') or filename_lower.endswith('.json')):
        is_json = True

    return {
        'image_index': image_index,
        'filename': filename,
        'filename_lower': filename_lower,
        'is_mask': is_mask,
        'is_color': is_color,
        'is_json': is_json,
        'metadata': metadata,
    }


@login_required
def patient_intraoral_segmentation_data(request, patient_id):
    """
    API endpoint to serve paired intraoral segmentation data.

    Display priority:
    1. original image
    2. json metadata (FDI, color, centroid, order)
    3. mask shape if safely matched
    4. color mask kept as fallback for frontend if needed
    """
    Patient = get_domain_models(request)['Patient']
    patient = get_object_or_404(Patient, patient_id=patient_id)
    user_profile = request.user.profile

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
        return JsonResponse({'error': 'Permission denied'}, status=403)

    try:
        intraoral_files = patient.files.filter(
            file_type__in=['intraoral_raw', 'intraoral_processed']
        ).order_by('created_at')

        paired = {}

        for file_obj in intraoral_files:
            file_path = file_obj.file_path
            if not file_path or not os.path.exists(file_path):
                continue

            info = _classify_intraoral_file(file_obj)
            image_index = info['image_index']
            if image_index is None:
                continue

            if image_index not in paired:
                paired[image_index] = {
                    'index': image_index,
                    'original': None,
                    'mask': None,
                    'color': None,
                    'json': None,
                    'display_mode': 'json_mask',
                }

            item = {
                'id': file_obj.id,
                'filename': info['filename'],
                'url': _serve_file_url(request, file_obj.id),
                'file_path': file_path,  # internal only
            }

            if info['is_json']:
                item['json_data'] = _load_segmentation_json(file_path)
                paired[image_index]['json'] = item
            elif info['is_color']:
                paired[image_index]['color'] = item
            elif info['is_mask']:
                item['annotations'] = []
                paired[image_index]['mask'] = item
            else:
                paired[image_index]['original'] = item

        images = []
        for idx in sorted(paired.keys()):
            pair = paired[idx]

            if not pair['original']:
                continue

            annotations = []

            if pair['json'] and pair['json'].get('json_data'):
                try:
                    annotations = _get_cached_annotations(
                        pair['mask']['file_path'] if pair['mask'] else None,
                        pair['json']['file_path'],
                        pair['json']['json_data']
                    )
                except Exception as ann_err:
                    logger.warning(
                        f"Failed to build json+mask annotations for image {idx}: {ann_err}",
                        exc_info=True
                    )
                    annotations = _build_json_only_annotations(pair['json']['json_data'])

            if pair['mask']:
                pair['mask']['annotations'] = annotations

            if any(a.get('source') == 'json_only' for a in annotations) and pair.get('color'):
                pair['display_mode'] = 'json_color_fallback'
            else:
                pair['display_mode'] = 'json_mask'

            if pair.get('original'):
                pair['original'].pop('file_path', None)

            if pair.get('mask'):
                pair['mask'].pop('file_path', None)

            if pair.get('color'):
                pair['color'].pop('file_path', None)

            if pair.get('json'):
                pair['json'].pop('file_path', None)
                pair['json'].pop('json_data', None)

            images.append(pair)

        if not images:
            return JsonResponse({'error': 'No intraoral segmentation data found'}, status=404)

        return JsonResponse({
            'images': images,
            'count': len(images),
        })

    except Exception as e:
        logger.error(f"Error serving intraoral segmentation data: {e}", exc_info=True)
        return JsonResponse({'error': 'Internal server error'}, status=500)


@login_required
def update_intraoral_segmentation(request, patient_id):
    """
    Save edited intraoral segmentation back to:
    - existing json file
    - existing grayscale mask file
    - existing color mask file

    It overwrites files using the same original filenames already linked to the image index.
    """
    if request.method != 'POST':
        return JsonResponse({'error': 'Only POST is allowed'}, status=405)

    Patient = get_domain_models(request)['Patient']
    patient = get_object_or_404(Patient, patient_id=patient_id)
    user_profile = request.user.profile

    can_edit = False
    if user_profile.is_admin():
        can_edit = True
    elif user_profile.is_annotator() and patient.visibility != 'debug':
        can_edit = True
    elif user_profile.is_student_developer() and patient.visibility == 'debug':
        can_edit = True

    if not can_edit:
        return JsonResponse({'error': 'Permission denied'}, status=403)

    try:
        payload = json.loads(request.body.decode('utf-8'))
    except Exception:
        return JsonResponse({'error': 'Invalid JSON body'}, status=400)

    images_payload = payload.get('images', [])
    if not isinstance(images_payload, list):
        return JsonResponse({'error': 'images must be a list'}, status=400)

    def _normalize_point(pt):
        if not isinstance(pt, (list, tuple)) or len(pt) < 2:
            return None
        try:
            x = int(round(float(pt[0])))
            y = int(round(float(pt[1])))
            return [x, y]
        except Exception:
            return None

    def _normalize_contour(contour):
        if not isinstance(contour, list):
            return []
        pts = []
        for pt in contour:
            p = _normalize_point(pt)
            if p is not None:
                pts.append(p)
        return pts

    def _annotation_bbox_from_contour(contour):
        pts = _normalize_contour(contour)
        if not pts:
            return [0, 0, 0, 0], 0, 0

        xs = [p[0] for p in pts]
        ys = [p[1] for p in pts]

        x_min = int(min(xs))
        y_min = int(min(ys))
        x_max = int(max(xs))
        y_max = int(max(ys))

        return [x_min, y_min, x_max - x_min, y_max - y_min], x_min, y_min

    def _annotation_centroid(contour):
        pts = _normalize_contour(contour)
        if not pts:
            return 0.0, 0.0
        sx = sum(p[0] for p in pts)
        sy = sum(p[1] for p in pts)
        n = len(pts)
        return float(sx) / n, float(sy) / n

    def _annotation_area(contour):
        pts = _normalize_contour(contour)
        if len(pts) < 3:
            return 0.0

        area = 0.0
        for i in range(len(pts)):
            x1, y1 = pts[i]
            x2, y2 = pts[(i + 1) % len(pts)]
            area += x1 * y2 - x2 * y1
        return abs(area) / 2.0

    def _hex_to_bgr(hex_color):
        value = str(hex_color or '').strip()

        if len(value) == 7 and value.startswith('#'):
            try:
                r = int(value[1:3], 16)
                g = int(value[3:5], 16)
                b = int(value[5:7], 16)
                return (b, g, r)
            except Exception:
                return (156, 163, 175)

        if len(value) == 4 and value.startswith('#'):
            try:
                r = int(value[1] * 2, 16)
                g = int(value[2] * 2, 16)
                b = int(value[3] * 2, 16)
                return (b, g, r)
            except Exception:
                return (156, 163, 175)

        return (156, 163, 175)

    def _load_image_shape(image_path):
        if not image_path or not os.path.exists(image_path):
            return None

        img = cv2.imread(image_path, cv2.IMREAD_COLOR)
        if img is None:
            return None

        h, w = img.shape[:2]
        return h, w

    try:
        intraoral_files = patient.files.filter(
            file_type__in=['intraoral_raw', 'intraoral_processed']
        ).order_by('created_at')

        files_by_index = {}

        for file_obj in intraoral_files:
            file_path = file_obj.file_path
            if not file_path or not os.path.exists(file_path):
                continue

            info = _classify_intraoral_file(file_obj)
            image_index = info['image_index']
            if image_index is None:
                continue

            if image_index not in files_by_index:
                files_by_index[image_index] = {
                    'original': None,
                    'mask': None,
                    'color': None,
                    'json': None,
                }

            if info['is_json']:
                files_by_index[image_index]['json'] = file_path
            elif info['is_color']:
                files_by_index[image_index]['color'] = file_path
            elif info['is_mask']:
                files_by_index[image_index]['mask'] = file_path
            else:
                files_by_index[image_index]['original'] = file_path

        updated = []
        missing = []

        for image_item in images_payload:
            image_index = image_item.get('index')
            annotations = image_item.get('annotations', [])

            try:
                image_index = int(image_index)
            except Exception:
                continue

            if not isinstance(annotations, list):
                annotations = []

            file_set = files_by_index.get(image_index)
            if not file_set:
                missing.append({
                    'index': image_index,
                    'reason': 'No files mapped for this image index'
                })
                continue

            json_path = file_set.get('json')
            mask_path = file_set.get('mask')
            color_path = file_set.get('color')
            original_path = file_set.get('original')

            if not json_path:
                missing.append({
                    'index': image_index,
                    'reason': 'JSON file not found'
                })
                continue

            shape = _load_image_shape(original_path)
            if shape is None:
                shape = _load_image_shape(mask_path) or _load_image_shape(color_path)

            if shape is None:
                missing.append({
                    'index': image_index,
                    'reason': 'Could not determine image size'
                })
                continue

            image_h, image_w = shape

            grayscale_mask = np.zeros((image_h, image_w), dtype=np.uint8)
            color_mask = np.zeros((image_h, image_w, 3), dtype=np.uint8)

            existing_json = _load_segmentation_json(json_path) or {}
            teeth = []

            for idx, ann in enumerate(annotations, start=1):
                fdi = str(ann.get('FDI_NUM') or ann.get('fdi') or '').strip()
                color = ann.get('color') or ''
                class_name = ann.get('class_name') or 'tooth'

                contour = _normalize_contour(ann.get('contour', []))
                if not contour:
                    contours = ann.get('contours', [])
                    if isinstance(contours, list) and contours:
                        contour = _normalize_contour(contours[0])

                bbox, x_min, y_min = _annotation_bbox_from_contour(contour)
                cx, cy = _annotation_centroid(contour)
                area = _annotation_area(contour)

                x_max = x_min + bbox[2]
                y_max = y_min + bbox[3]

                appearance_idx = _safe_int(ann.get('appearance_idx', idx), idx)

                tooth = {
                    'appearance_idx': appearance_idx,
                    'FDI_NUM': fdi,
                    'class_name': class_name,
                    'color': color,
                    'pixel_area': float(area),
                    'x_min': int(x_min),
                    'y_min': int(y_min),
                    'x_max': int(x_max),
                    'y_max': int(y_max),
                    'centroid_x': float(cx),
                    'centroid_y': float(cy),
                    'arch': ann.get('arch'),
                    'contour_count': 1 if contour else 0,
                    'contour': contour,
                    'contours': [contour] if contour else [],
                }
                teeth.append(tooth)

                if len(contour) >= 3:
                    pts = np.array(contour, dtype=np.int32)

                    gray_value = max(1, min(255, appearance_idx))
                    cv2.fillPoly(grayscale_mask, [pts], gray_value)

                    bgr = _hex_to_bgr(color)
                    cv2.fillPoly(color_mask, [pts], bgr)

            json_payload = {
                'patient_id': existing_json.get('patient_id', f'patient_{patient.patient_id}'),
                'case_name': existing_json.get(
                    'case_name',
                    os.path.splitext(os.path.basename(json_path))[0].replace('_json', '')
                ),
                'annotation_count': len(teeth),
                'teeth': teeth,
            }

            with open(json_path, 'w', encoding='utf-8') as f:
                json.dump(json_payload, f, indent=2, ensure_ascii=False)

            if mask_path:
                ok_mask = cv2.imwrite(mask_path, grayscale_mask)
                if not ok_mask:
                    raise RuntimeError(f'Failed to write mask file: {mask_path}')

            if color_path:
                ok_color = cv2.imwrite(color_path, color_mask)
                if not ok_color:
                    raise RuntimeError(f'Failed to write color mask file: {color_path}')

            # clear related cache after save
            try:
                json_mtime = os.path.getmtime(json_path) if os.path.exists(json_path) else 0
            except Exception:
                json_mtime = 0
            try:
                mask_mtime = os.path.getmtime(mask_path) if mask_path and os.path.exists(mask_path) else 0
            except Exception:
                mask_mtime = 0

            cache.delete(f"seg_json:{json_path}:{json_mtime}")
            if mask_path:
                cache.delete(f"mask_regions:{mask_path}:{mask_mtime}")
            cache.delete(f"seg_annotations:{json_path}:{json_mtime}:{mask_path}:{mask_mtime}")

            updated.append({
                'index': image_index,
                'json_path': json_path,
                'mask_path': mask_path,
                'color_path': color_path,
                'annotation_count': len(teeth),
            })

        return JsonResponse({
            'status': 'success',
            'message': 'Segmentation updated successfully',
            'updated_count': len(updated),
            'updated_images': updated,
            'missing_items': missing,
        })

    except Exception as e:
        logger.error(f"Error updating intraoral segmentation data: {e}", exc_info=True)
        return JsonResponse({'error': f'Internal server error: {str(e)}'}, status=500)