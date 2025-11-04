"""Patient detail and management views."""
from django.shortcuts import render, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
import json
import os
import logging

from ..models import Patient, Classification
from ..forms import PatientManagementForm
from .helpers import redirect_with_namespace, render_with_fallback

logger = logging.getLogger(__name__)

@login_required
def patient_detail(request, patient_id):
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
        messages.error(request, 'You do not have permission to view this scan.')
        return redirect_with_namespace(request, 'patient_list')
    
    ai_classification = patient.classifications.filter(classifier='pipeline').first()
    manual_classification = patient.classifications.filter(classifier='manual').first()
    
    management_form = PatientManagementForm(instance=patient, user=request.user)
    
    has_cbct = False
    try:
        raw_cbct = patient.get_cbct_raw_file()
        if raw_cbct and os.path.exists(raw_cbct.file_path):
            has_cbct = True
        elif patient.cbct:  # Fallback to old field
            has_cbct = True
    except:
        pass
    
    can_modify = False
    if user_profile.is_admin():
        can_modify = True
    elif user_profile.is_annotator() and patient.visibility != 'debug':
        can_modify = True
    elif user_profile.is_student_developer() and patient.visibility == 'debug':
        can_modify = True
    
    if request.method == 'POST' and can_modify:
        action = request.POST.get('action')
        
        if action == 'accept_ai' and ai_classification:
            Classification.objects.create(
                patient=patient,
                classifier='manual',
                sagittal_left=ai_classification.sagittal_left,
                sagittal_right=ai_classification.sagittal_right,
                vertical=ai_classification.vertical,
                transverse=ai_classification.transverse,
                midline=ai_classification.midline,
                annotator=request.user
            )
            messages.success(request, 'AI classification accepted!')
            return redirect_with_namespace(request, 'patient_detail', patient_id=patient_id)
        
        elif action == 'update_management':
            management_form = PatientManagementForm(request.POST, instance=patient, user=request.user)
            if management_form.is_valid():
                management_form.save()
                messages.success(request, 'Scan settings updated successfully!')
                return redirect_with_namespace(request, 'patient_detail', patient_id=patient_id)
        
        elif action == 'update_files':
            updated_files = []
            reprocess_ios = False
            reprocess_cbct = False
            
            has_upper_scan = 'upper_scan' in request.FILES
            has_lower_scan = 'lower_scan' in request.FILES
            has_cbct_file = 'cbct' in request.FILES
            has_cbct_folder = 'cbct_folder_files' in request.FILES
            
            if has_upper_scan:
                updated_files.append('upper scan')
                reprocess_ios = True
            
            if has_lower_scan:
                updated_files.append('lower scan')
                reprocess_ios = True
            
            if has_cbct_file:
                updated_files.append('CBCT')
                reprocess_cbct = True
            
            if has_cbct_folder:
                updated_files.append('CBCT Folder')
                reprocess_cbct = True
            
            if updated_files:
                from ..file_utils import save_cbct_to_dataset, save_ios_to_dataset
                
                if reprocess_ios and (has_upper_scan or has_lower_scan):
                    patient.classifications.filter(classifier='pipeline').delete()
                    patient.upper_scan_norm = None
                    patient.lower_scan_norm = None
                    patient.ios_processing_status = 'processing'
                    patient.save()
                    
                    try:
                        result = save_ios_to_dataset(
                            patient, 
                            request.FILES.get('upper_scan'),
                            request.FILES.get('lower_scan')
                        )
                        if result['processing_job']:
                            messages.success(request, f'IOS scan(s) uploaded and queued for processing (Job #{result["processing_job"].id})')
                        if result['bite_classification_job']:
                            messages.success(request, f'Bite classification job #{result["bite_classification_job"].id} created (waiting for IOS completion)')
                    except Exception as e:
                        messages.error(request, f'Error uploading IOS scan(s): {e}')
                
                if reprocess_cbct and (has_cbct_file or has_cbct_folder):
                    patient.cbct_processing_status = 'processing'
                    patient.save()
                    
                    if has_cbct_folder:
                        try:
                            from ..file_utils import save_cbct_folder_to_dataset
                            from ..models import validate_cbct_folder
                            
                            cbct_folder_files = request.FILES.getlist('cbct_folder_files')
                            validate_cbct_folder(cbct_folder_files)
                            
                            folder_path, processing_job = save_cbct_folder_to_dataset(patient, cbct_folder_files)
                            messages.success(request, f'CBCT folder uploaded and queued for processing (Job #{processing_job.id})')
                        except Exception as e:
                            messages.error(request, f'Error uploading CBCT folder: {e}')
                    elif has_cbct_file:
                        try:
                            file_path, processing_job = save_cbct_to_dataset(patient, request.FILES['cbct'])
                            messages.success(request, f'CBCT uploaded and queued for processing (Job #{processing_job.id})')
                        except Exception as e:
                            messages.error(request, f'Error uploading CBCT: {e}')
                
                files_str = ', '.join(updated_files)
                messages.success(request, f'Successfully uploaded {files_str}! Files are queued for processing.')

                # Update patient modalities based on actual uploaded files using helper
                try:
                    from ..modality_helpers import get_modalities_for_uploaded_files
                    detected_modalities = get_modalities_for_uploaded_files(request.FILES)
                    if detected_modalities:
                        patient.modalities.add(*detected_modalities)
                except Exception as e:
                    import logging
                    logger = logging.getLogger(__name__)
                    logger.error(f"Error detecting modalities: {e}")
                return redirect_with_namespace(request, 'patient_detail', patient_id=patient_id)
            else:
                messages.warning(request, 'No files were selected for upload.')
                return redirect('patient_detail', patient_id=patient_id)
    
    # Build patient's modalities list (slug + name + subtypes) using relations and FileRegistry.modality only
    try:
        from common.models import Modality as _Modality
        # Start from relations
        rel_modalities = list(patient.modalities.all().order_by('name'))
        rel_by_slug = { (getattr(m, 'slug', None) or getattr(m, 'name', '').lower()): m for m in rel_modalities }
        # Add any modalities referenced by FileRegistry.modality
        file_mods = patient.files.filter(modality__isnull=False).values('modality__slug').distinct() if hasattr(patient, 'files') else []
        for fm in file_mods:
            slug = fm.get('modality__slug') or ''
            if slug and slug not in rel_by_slug:
                m = _Modality.objects.filter(slug=slug).first()
                if m:
                    rel_by_slug[slug] = m
        # Compose list with subtypes and UI label if present
        patient_modalities = []
        for slug, m in rel_by_slug.items():
            subtypes = []
            try:
                subtypes = list(getattr(m, 'subtypes', []) or [])
            except Exception:
                subtypes = []
            patient_modalities.append({
                'slug': getattr(m, 'slug', slug) or slug,
                'name': getattr(m, 'name', slug),
                'label': getattr(m, 'label', '') or '',
                'subtypes': subtypes,
            })
    except Exception:
        patient_modalities = []

    # Choose default modality: prefer first available (skip modalities marked as non-default)
    default_modality_slug = None
    try:
        from ..modality_helpers import get_modality_by_slug
        for m in patient_modalities:
            modality_obj = get_modality_by_slug(m['slug'])
            if modality_obj:
                metadata = getattr(modality_obj, 'metadata', {}) or {}
                # Skip if marked as non-default for viewing
                if not metadata.get('exclude_from_default_view', False):
                    default_modality_slug = m['slug']
                    break
    except Exception:
        # Fallback: just pick the first one
        if patient_modalities:
            default_modality_slug = patient_modalities[0]['slug']

    # JSON-serializable fields for template
    import json as _json
    patient_modalities_json = _json.dumps(patient_modalities)
    default_modality_json = _json.dumps(default_modality_slug)

    # Organize patient files for file management section
    patient_files = {'raw': [], 'processed': [], 'other': []}
    try:
        import os
        all_files = patient.files.all().order_by('-created_at')
        
        for file_obj in all_files:
            # Add computed properties for display
            modality_name = ''
            if file_obj.modality:
                modality_name = getattr(file_obj.modality, 'label', '') or getattr(file_obj.modality, 'name', '') or ''
            elif file_obj.metadata and file_obj.metadata.get('modality_slug'):
                # Fallback to trying to get modality info from metadata
                try:
                    from common.models import Modality as _Modality
                    mod = _Modality.objects.filter(slug=file_obj.metadata['modality_slug']).first()
                    if mod:
                        modality_name = getattr(mod, 'label', '') or getattr(mod, 'name', '') or ''
                except Exception:
                    pass
            
            file_data = {
                'id': file_obj.id,
                'file_type': file_obj.file_type,
                'file_path': file_obj.file_path,
                'file_size': file_obj.file_size,
                'created_at': file_obj.created_at,
                'filename': os.path.basename(file_obj.file_path) if file_obj.file_path else 'Unknown',
                'original_filename': file_obj.metadata.get('original_filename', '') if file_obj.metadata else '',
                'file_size_mb': f"{file_obj.file_size / (1024 * 1024):.2f}" if file_obj.file_size else '0.00',
                'modality_name': modality_name,
            }
            
            # Categorize files dynamically based on file_type
            # Check for raw files (contains _raw or is rgb_image)
            if '_raw' in file_obj.file_type or file_obj.file_type == 'rgb_image':
                patient_files['raw'].append(file_data)
            # Check for processed files (contains _processed or is bite_classification)
            elif '_processed' in file_obj.file_type or file_obj.file_type == 'bite_classification':
                patient_files['processed'].append(file_data)
            else:
                patient_files['other'].append(file_data)
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Error organizing patient files: {e}")


    # Voice captions. TODO: filter only captions made by the current user for all captions?
    # If the patient is Debug/1 (ID: 4646), only the admin can see all the captions, each users can see only their own captions.
    voice_captions = patient.voice_captions.all()
    if not user_profile.is_admin() and patient.patient_id == 4646:
        voice_captions = voice_captions.filter(user=request.user)

    context = {
        'scan_pair': patient,
        'ai_classification': ai_classification,
        'manual_classification': manual_classification,
        'user_profile': user_profile,
        'management_form': management_form,
        'has_cbct': has_cbct,
        'patient_modalities': patient_modalities,
        'default_modality_slug': default_modality_slug,
        'patient_modalities_json': patient_modalities_json,
        'default_modality_json': default_modality_json,
        'patient_files': patient_files,
        'voice_captions': voice_captions,
    }
    # Allowed modalities for current project (to conditionally show upload controls)
    try:
        allowed_modalities = []
        cp_id = request.session.get('current_project_id')
        if cp_id:
            from common.models import Project as _Project
            proj = _Project.objects.prefetch_related('modalities').get(id=cp_id)
            allowed_modalities = list(proj.modalities.filter(is_active=True))
        if not allowed_modalities:
            # Fallback: get all active modalities
            from common.models import Modality as _Modality
            allowed_modalities = list(_Modality.objects.filter(is_active=True))
        context['allowed_modalities'] = allowed_modalities
        context['allowed_modality_slugs'] = [m.slug for m in allowed_modalities]
    except Exception:
        pass
    return render_with_fallback(request, 'patient_detail', context)

@login_required
def update_patient_name(request, patient_id):
    """AJAX endpoint for updating scan name"""
    user_profile = request.user.profile
    
    try:
        scan_pair = get_object_or_404(Patient, patient_id=patient_id)
        
        can_modify = False
        if user_profile.is_admin():
            can_modify = True
        elif user_profile.is_annotator() and scan_pair.visibility != 'debug':
            can_modify = True
        elif user_profile.is_student_developer() and scan_pair.visibility == 'debug':
            can_modify = True
        
        if not can_modify:
            return JsonResponse({'error': 'Permission denied'}, status=403)
        data = json.loads(request.body)
        
        new_name = data.get('name', '').strip()
        if not new_name:
            return JsonResponse({'error': 'Name cannot be empty'}, status=400)
        
        scan_pair.name = new_name
        scan_pair.save()
        
        return JsonResponse({'success': True, 'name': new_name})
        
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


