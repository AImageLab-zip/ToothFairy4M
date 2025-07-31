from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth import login, authenticate
from django.contrib.auth.decorators import login_required, user_passes_test
from django.contrib.auth.forms import UserCreationForm
from django.contrib import messages
from django.http import JsonResponse, HttpResponse
from django.core.paginator import Paginator
from django.db.models import Q
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
from django.core.files.storage import default_storage
from django.core.files.base import ContentFile
import json
import os
from django.utils import timezone
from django.contrib.auth.models import User
from django.urls import reverse
import uuid

from .models import (
    Patient, ScanPair, Classification, UserProfile, Dataset, VoiceCaption, ProcessingJob, FileRegistry, Invitation
)
from .forms import (
    PatientForm, ScanPairForm, ClassificationForm, ScanManagementForm, DatasetForm, InvitationForm, InvitedUserCreationForm
)
from .processing import execute_ios_processing_command, execute_cbct_processing_command


def home(request):
    if request.user.is_authenticated:
        return redirect('scan_list')
    return render(request, 'scans/home.html')


def register(request):
    if request.method == 'POST':
        form = InvitedUserCreationForm(request.POST)
        if form.is_valid():
            invitation = Invitation.objects.get(code=form.cleaned_data['invitation_code'])
            user = form.save()
            # Update the user profile with role from invitation (signal already created it)
            user.profile.role = invitation.role
            user.profile.save()
            # Mark invitation as used
            invitation.used_at = timezone.now()
            invitation.used_by = user
            invitation.save()
            messages.success(request, f'Account created for {user.username}!')
            return redirect('login')
    else:
        # Pre-fill invitation code if provided in URL
        initial = {}
        if 'code' in request.GET:
            initial['invitation_code'] = request.GET['code']
            try:
                invitation = Invitation.objects.get(code=request.GET['code'])
                if invitation.email:
                    initial['email'] = invitation.email
            except Invitation.DoesNotExist:
                pass
        form = InvitedUserCreationForm(initial=initial)
    return render(request, 'registration/register.html', {'form': form})


@login_required
@user_passes_test(lambda u: u.profile.is_admin)
def invitation_list(request):
    invitations = Invitation.objects.all().order_by('-created_at')
    if request.method == 'POST':
        form = InvitationForm(request.POST)
        if form.is_valid():
            invitation = form.save(commit=False)
            invitation.code = str(uuid.uuid4())
            invitation.created_by = request.user
            invitation.save()
            messages.success(request, 'Invitation created successfully!')
            return redirect('invitation_list')
    else:
        form = InvitationForm()
    return render(request, 'registration/invitation_list.html', {
        'invitations': invitations,
        'form': form,
        'registration_base_url': request.build_absolute_uri(reverse('register'))
    })


@login_required
@user_passes_test(lambda u: u.profile.is_admin)
def delete_invitation(request, code):
    invitation = get_object_or_404(Invitation, code=code)
    if not invitation.used_at:  # Only allow deleting unused invitations
        invitation.delete()
        messages.success(request, 'Invitation deleted successfully!')
    return redirect('invitation_list')


@login_required
def scan_list(request):
    user_profile = request.user.profile
    
    # Filter scans based on user role
    if user_profile.is_annotator():
        scans = ScanPair.objects.all()
    else:
        scans = ScanPair.objects.filter(visibility='public')
    
    # Get filter parameters
    search_query = request.GET.get('search', '').strip()
    status_filter = request.GET.get('status', '')
    visibility_filter = request.GET.get('visibility', '')
    uploader_filter = request.GET.get('uploader', '')
    annotator_filter = request.GET.get('annotator', '')
    date_from = request.GET.get('date_from', '')
    date_to = request.GET.get('date_to', '')
    
    # Apply basic filters
    if search_query:
        scans = scans.filter(
            Q(name__icontains=search_query) |
            Q(patient__patient_id__icontains=search_query) |
            Q(scanpair_id__icontains=search_query)
        )
    
    if visibility_filter:
        scans = scans.filter(visibility=visibility_filter)
    
    if uploader_filter:
        scans = scans.filter(uploaded_by__id=uploader_filter)
    
    if date_from:
        try:
            from datetime import datetime
            date_from_parsed = datetime.strptime(date_from, '%Y-%m-%d').date()
            scans = scans.filter(uploaded_at__date__gte=date_from_parsed)
        except ValueError:
            pass
    
    if date_to:
        try:
            from datetime import datetime
            date_to_parsed = datetime.strptime(date_to, '%Y-%m-%d').date()
            scans = scans.filter(uploaded_at__date__lte=date_to_parsed)
        except ValueError:
            pass
    
    # Prefetch classifications and prepare data
    scans = scans.prefetch_related(
        'classifications', 
        'uploaded_by', 
        'patient',
        'voice_captions'
    ).select_related('dataset').order_by('-uploaded_at')
    
    # Prepare classification status for each scan
    scans_with_status = []
    for scan in scans:
        manual_classification = scan.classifications.filter(classifier='manual').first()
        ai_classification = scan.classifications.filter(classifier='pipeline').first()
        
        # Voice caption processing status
        voice_captions = scan.voice_captions.all()
        voice_caption_processing = any(
            vc.processing_status in ['pending', 'processing'] for vc in voice_captions
        )
        voice_caption_processed = (
            voice_captions.exists() and 
            all(vc.processing_status == 'completed' for vc in voice_captions)
        )
        
        # Get unique voice caption annotators
        voice_annotators = list(set(vc.user.username for vc in voice_captions))
        
        scan_data = {
            'scan': scan,
            'manual_classification': manual_classification,
            'ai_classification': ai_classification,
            'has_manual': manual_classification is not None,
            'has_ai_only': ai_classification is not None and manual_classification is None,
            'needs_processing': manual_classification is None and ai_classification is None,
            'voice_caption_processing': voice_caption_processing,
            'voice_caption_processed': voice_caption_processed,
            'voice_annotators': voice_annotators,
        }
        scans_with_status.append(scan_data)
    
    # Apply status filter (after data preparation)
    if status_filter:
        if status_filter == 'verified':
            scans_with_status = [s for s in scans_with_status if s['has_manual']]
        elif status_filter == 'needs_review':
            scans_with_status = [s for s in scans_with_status if s['has_ai_only']]
        elif status_filter == 'processing':
            scans_with_status = [s for s in scans_with_status if s['needs_processing']]
    
    # Apply annotator filter (after data preparation)
    if annotator_filter:
        scans_with_status = [
            s for s in scans_with_status 
            if s['manual_classification'] and str(s['manual_classification'].annotator.id) == annotator_filter
        ]
    
    # Get filter options for dropdowns
    uploaders = User.objects.filter(scanpair__isnull=False).distinct().order_by('username')
    annotators = User.objects.filter(
        profile__role__in=['annotator', 'admin'],
        classification__classifier='manual'
    ).distinct().order_by('username')
    
    # Pagination
    paginator = Paginator(scans_with_status, 20)  # More items per page for list view
    page_number = request.GET.get('page')
    page_obj = paginator.get_page(page_number)
    
    context = {
        'page_obj': page_obj,
        'search_query': search_query,
        'status_filter': status_filter,
        'visibility_filter': visibility_filter,
        'uploader_filter': uploader_filter,
        'annotator_filter': annotator_filter,
        'date_from': date_from,
        'date_to': date_to,
        'user_profile': user_profile,
        'uploaders': uploaders,
        'annotators': annotators,
    }
    return render(request, 'scans/scan_list.html', context)


@login_required
def upload_scan(request):
    user_profile = request.user.profile
    
    if not user_profile.is_annotator():
        messages.error(request, 'You do not have permission to upload scans.')
        return redirect('scan_list')
    
    if request.method == 'POST':
        patient_form = PatientForm(request.POST)
        scan_form = ScanPairForm(request.POST, request.FILES)
        
        if scan_form.is_valid():
            # Create patient first (no form data needed)
            patient = Patient.objects.create()
            
            # Extract files from form before saving
            upper_scan_file = scan_form.cleaned_data.get('upper_scan_raw')
            lower_scan_file = scan_form.cleaned_data.get('lower_scan_raw')
            cbct_file = scan_form.cleaned_data.get('cbct')
            
            # Save scan pair without file fields (they'll be stored in /dataset)
            scan_pair = scan_form.save(commit=False)
            scan_pair.patient = patient
            scan_pair.uploaded_by = request.user
            # Clear file fields since we'll store them in /dataset instead
            scan_pair.upper_scan_raw = None
            scan_pair.lower_scan_raw = None
            scan_pair.cbct = None
            scan_pair.save()
            
            # Now process files using the new deferred processing system
            try:
                from .file_utils import save_cbct_to_dataset, save_ios_to_dataset
                processing_jobs = []
                
                # Handle IOS files if provided
                if upper_scan_file or lower_scan_file:
                    scan_pair.ios_processing_status = 'processing'
                    scan_pair.save()
                    
                    result = save_ios_to_dataset(scan_pair, upper_scan_file, lower_scan_file)
                    if result['processing_job']:
                        processing_jobs.append(f"IOS Job #{result['processing_job'].id}")
                
                # Handle CBCT file if provided
                if cbct_file:
                    scan_pair.cbct_processing_status = 'processing'  
                    scan_pair.save()
                    
                    file_path, processing_job = save_cbct_to_dataset(scan_pair, cbct_file)
                    processing_jobs.append(f"CBCT Job #{processing_job.id}")
                
                if processing_jobs:
                    job_list = ', '.join(processing_jobs)
                    messages.success(request, f'Scan uploaded successfully! Processing jobs created: {job_list}')
                else:
                    messages.success(request, 'Scan uploaded successfully!')
                    
            except Exception as e:
                messages.error(request, f'Error setting up processing: {e}')
            
            return redirect('scan_detail', scanpair_id=scan_pair.scanpair_id)
    else:
        patient_form = PatientForm()
        scan_form = ScanPairForm()
    
    context = {
        'patient_form': patient_form,
        'scan_form': scan_form,
    }
    return render(request, 'scans/upload_scan.html', context)


@login_required
def scan_detail(request, scanpair_id):
    scan_pair = get_object_or_404(ScanPair, scanpair_id=scanpair_id)
    user_profile = request.user.profile
    
    # Check permissions
    if not user_profile.is_annotator() and scan_pair.visibility == 'private':
        messages.error(request, 'You do not have permission to view this scan.')
        return redirect('scan_list')
    
    # Get AI and manual classifications
    ai_classification = scan_pair.classifications.filter(classifier='pipeline').first()
    manual_classification = scan_pair.classifications.filter(classifier='manual').first()
    
    # Initialize scan management form
    management_form = ScanManagementForm(instance=scan_pair)
    
    # Check for CBCT availability in FileRegistry
    has_cbct = False
    try:
        raw_cbct = scan_pair.get_cbct_raw_file()
        if raw_cbct and os.path.exists(raw_cbct.file_path):
            has_cbct = True
        elif scan_pair.cbct:  # Fallback to old field
            has_cbct = True
    except:
        pass
    
    # Handle POST requests
    if request.method == 'POST' and user_profile.is_annotator():
        action = request.POST.get('action')
        
        if action == 'accept_ai' and ai_classification:
            # Create manual classification based on AI prediction
            Classification.objects.create(
                scanpair=scan_pair,
                classifier='manual',
                sagittal_left=ai_classification.sagittal_left,
                sagittal_right=ai_classification.sagittal_right,
                vertical=ai_classification.vertical,
                transverse=ai_classification.transverse,
                midline=ai_classification.midline,
                annotator=request.user
            )
            messages.success(request, 'AI classification accepted!')
            return redirect('scan_detail', scanpair_id=scanpair_id)
        
        elif action == 'update_management':
            # Handle scan management updates (visibility and dataset)
            management_form = ScanManagementForm(request.POST, instance=scan_pair)
            if management_form.is_valid():
                management_form.save()
                messages.success(request, 'Scan settings updated successfully!')
                return redirect('scan_detail', scanpair_id=scanpair_id)
        
        elif action == 'update_files':
            # Handle file uploads
            updated_files = []
            reprocess_ios = False
            reprocess_cbct = False
            
            # Handle upper scan upload
            if 'upper_scan' in request.FILES:
                scan_pair.upper_scan_raw = request.FILES['upper_scan']
                updated_files.append('upper scan')
                reprocess_ios = True
            
            # Handle lower scan upload
            if 'lower_scan' in request.FILES:
                scan_pair.lower_scan_raw = request.FILES['lower_scan']
                updated_files.append('lower scan')
                reprocess_ios = True
            
            # Handle CBCT upload
            if 'cbct' in request.FILES:
                updated_files.append('CBCT')
                reprocess_cbct = True
            
            if updated_files:
                # Import the new file utilities
                from .file_utils import save_cbct_to_dataset, save_ios_to_dataset
                
                # Reset processing status for updated scan types
                if reprocess_ios and (request.FILES.get('upper_scan') or request.FILES.get('lower_scan')):
                    # Clear existing classifications to trigger reprocessing
                    scan_pair.classifications.filter(classifier='pipeline').delete()
                    # Reset normalized scans
                    scan_pair.upper_scan_norm = None
                    scan_pair.lower_scan_norm = None
                    scan_pair.ios_processing_status = 'processing'
                    scan_pair.save()
                    
                    # Save IOS files to dataset and create processing job
                    try:
                        result = save_ios_to_dataset(
                            scan_pair, 
                            request.FILES.get('upper_scan'),
                            request.FILES.get('lower_scan')
                        )
                        if result['processing_job']:
                            messages.success(request, f'IOS scan(s) uploaded and queued for processing (Job #{result["processing_job"].id})')
                    except Exception as e:
                        messages.error(request, f'Error uploading IOS scan(s): {e}')
                
                if reprocess_cbct and 'cbct' in request.FILES:
                    scan_pair.cbct_processing_status = 'processing'
                    scan_pair.save()
                    
                    # Save CBCT file to dataset and create processing job
                    try:
                        file_path, processing_job = save_cbct_to_dataset(scan_pair, request.FILES['cbct'])
                        messages.success(request, f'CBCT uploaded and queued for processing (Job #{processing_job.id})')
                    except Exception as e:
                        messages.error(request, f'Error uploading CBCT: {e}')
                
                # Success message
                files_str = ', '.join(updated_files)
                messages.success(request, f'Successfully uploaded {files_str}! Files are queued for processing.')
                return redirect('scan_detail', scanpair_id=scanpair_id)
            else:
                messages.warning(request, 'No files were selected for upload.')
                return redirect('scan_detail', scanpair_id=scanpair_id)
    
    context = {
        'scan_pair': scan_pair,
        'ai_classification': ai_classification,
        'manual_classification': manual_classification,
        'user_profile': user_profile,
        'management_form': management_form,
        'has_cbct': has_cbct,  # Add has_cbct to context
    }
    return render(request, 'scans/scan_detail.html', context)


@login_required
@require_POST
@csrf_exempt
def update_classification(request, scanpair_id):
    """AJAX endpoint for instant classification updates"""
    if not request.user.profile.is_annotator():
        return JsonResponse({'error': 'Permission denied'}, status=403)
    
    try:
        scan_pair = get_object_or_404(ScanPair, scanpair_id=scanpair_id)
        data = json.loads(request.body)
        
        field = data.get('field')
        value = data.get('value')
        
        # Validate field and value
        valid_fields = ['sagittal_left', 'sagittal_right', 'vertical', 'transverse', 'midline']
        if field not in valid_fields:
            return JsonResponse({'error': 'Invalid field'}, status=400)
        
        # Get or create manual classification
        manual_classification, created = Classification.objects.get_or_create(
            scanpair=scan_pair,
            classifier='manual',
            defaults={
                'annotator': request.user,
                'sagittal_left': 'I',
                'sagittal_right': 'I', 
                'vertical': 'normal',
                'transverse': 'normal',
                'midline': 'centered'
            }
        )
        
        # If created, copy AI values as defaults
        if created:
            ai_classification = scan_pair.classifications.filter(classifier='pipeline').first()
            if ai_classification:
                manual_classification.sagittal_left = ai_classification.sagittal_left
                manual_classification.sagittal_right = ai_classification.sagittal_right
                manual_classification.vertical = ai_classification.vertical
                manual_classification.transverse = ai_classification.transverse
                manual_classification.midline = ai_classification.midline
        
        # Update the specific field
        setattr(manual_classification, field, value)
        manual_classification.save()
        
        return JsonResponse({
            'success': True,
            'field': field,
            'value': value,
            'display_value': getattr(manual_classification, f'get_{field}_display')()
        })
        
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@login_required
@require_POST
@csrf_exempt
def update_scan_name(request, scanpair_id):
    """AJAX endpoint for updating scan name"""
    if not request.user.profile.is_annotator():
        return JsonResponse({'error': 'Permission denied'}, status=403)
    
    try:
        scan_pair = get_object_or_404(ScanPair, scanpair_id=scanpair_id)
        data = json.loads(request.body)
        
        new_name = data.get('name', '').strip()
        if not new_name:
            return JsonResponse({'error': 'Name cannot be empty'}, status=400)
        
        scan_pair.name = new_name
        scan_pair.save()
        
        return JsonResponse({'success': True, 'name': new_name})
        
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@login_required
def scan_viewer_data(request, scanpair_id):
    """API endpoint to provide scan data for 3D viewer"""
    scan_pair = get_object_or_404(ScanPair, scanpair_id=scanpair_id)
    user_profile = request.user.profile
    
    # Check permissions
    if not user_profile.is_annotator() and scan_pair.visibility == 'private':
        return JsonResponse({'error': 'Permission denied'}, status=403)
    
    # Try to get scan URLs from FileRegistry first, fallback to old fields
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
    except:
        pass
    
    # Fallback to old file fields if FileRegistry doesn't have files
    if not upper_scan_url or not lower_scan_url:
        try:
            if scan_pair.upper_scan_norm and scan_pair.lower_scan_norm:
                upper_scan_url = scan_pair.upper_scan_norm.url
                lower_scan_url = scan_pair.lower_scan_norm.url
            elif scan_pair.upper_scan_raw and scan_pair.lower_scan_raw:
                upper_scan_url = scan_pair.upper_scan_raw.url
                lower_scan_url = scan_pair.lower_scan_raw.url
        except:
            pass
    
    if not upper_scan_url or not lower_scan_url:
        return JsonResponse({'error': 'No IOS scan data available'}, status=404)
    
    data = {
        'upper_scan_url': request.build_absolute_uri(upper_scan_url),
        'lower_scan_url': request.build_absolute_uri(lower_scan_url),
        'patient_info': {
            'patient_id': scan_pair.patient.patient_id,
        }
    }
    
    return JsonResponse(data)


@login_required
def scan_cbct_data(request, scanpair_id):
    """API endpoint to serve CBCT data"""
    import gzip
    import os
    
    scan_pair = get_object_or_404(ScanPair, scanpair_id=scanpair_id)
    user_profile = request.user.profile
    
    # Check permissions
    if not user_profile.is_annotator() and scan_pair.visibility == 'private':
        return JsonResponse({'error': 'Permission denied'}, status=403)
    
    # Get CBCT file path from FileRegistry first, fallback to old field
    file_path = None
    
    try:
        # Check FileRegistry for raw CBCT first (prioritize raw file)
        raw_cbct = scan_pair.get_cbct_raw_file()
        if raw_cbct and os.path.exists(raw_cbct.file_path):
            file_path = raw_cbct.file_path
    except:
        pass
    
    # Fallback to old file field
    if not file_path and scan_pair.cbct:
        try:
            file_path = scan_pair.cbct.path
        except:
            pass
    
    if not file_path or not os.path.exists(file_path):
        return JsonResponse({'error': 'No CBCT data available'}, status=404)
    
    try:
        # Check if file is gzipped and decompress if needed
        with open(file_path, 'rb') as f:
            # Read first 2 bytes to check for gzip magic number
            magic = f.read(2)
            f.seek(0)
            
            if magic == b'\x1f\x8b':  # gzip magic number
                print(f"Decompressing gzipped CBCT file: {file_path}")
                # Decompress the file
                with gzip.open(file_path, 'rb') as gz_file:
                    decompressed_data = gz_file.read()
                
                response = HttpResponse(decompressed_data, content_type='application/octet-stream')
                response['Content-Disposition'] = f'attachment; filename="cbct_{scanpair_id}.nii"'
                response['X-Decompressed'] = 'true'  # Header to indicate decompression
                return response
            else:
                # File is not gzipped, serve as-is
                data = f.read()
                response = HttpResponse(data, content_type='application/octet-stream')
                response['Content-Disposition'] = f'attachment; filename="cbct_{scanpair_id}.nii"'
                return response
                
    except Exception as e:
        print(f"Error serving CBCT data: {e}")
        return JsonResponse({'error': f'Failed to load CBCT data: {str(e)}'}, status=500)


@login_required
@require_POST
def upload_voice_caption(request, scanpair_id):
    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed'}, status=405)
    
    scan_pair = get_object_or_404(ScanPair, scanpair_id=scanpair_id)
    
    # Check permissions (could be expanded)
    if not request.user.is_authenticated:
        return JsonResponse({'error': 'Authentication required'}, status=401)
    
    try:
        audio_file = request.FILES.get('audio_file')
        duration = float(request.POST.get('duration', 0))
        modality = request.POST.get('modality', 'cbct')  # Default to CBCT
        
        if not audio_file:
            return JsonResponse({'error': 'No audio file provided'}, status=400)
        
        if duration <= 0:
            return JsonResponse({'error': 'Invalid duration'}, status=400)
        
        # Validate modality
        if modality not in ['ios', 'cbct']:
            modality = 'cbct'  # Default fallback
        
        # Create VoiceCaption instance (without audio file initially)
        voice_caption = VoiceCaption.objects.create(
            scanpair=scan_pair,
            user=request.user,
            modality=modality,
            duration=duration,
            processing_status='pending'
        )
        
        # Save audio file to dataset and create processing job
        try:
            from .file_utils import save_audio_to_dataset
            file_path, processing_job = save_audio_to_dataset(voice_caption, audio_file)
            print(f"Audio file saved to {file_path}, processing job #{processing_job.id} created")
        except Exception as e:
            print(f"Error saving audio file or creating processing job: {e}")
            # Continue anyway, the caption is saved
        
        # Return caption data for the UI
        quality_status = voice_caption.get_quality_status()
        
        # Get audio file URL from FileRegistry
        audio_file = voice_caption.get_audio_file()
        audio_url = None
        if audio_file and os.path.exists(audio_file.file_path):
            audio_url = f'/api/processing/files/serve/{audio_file.id}/'
        
        return JsonResponse({
            'success': True,
            'caption': {
                'id': voice_caption.id,
                'user_username': voice_caption.user.username,
                'modality_display': voice_caption.get_modality_display(),
                'display_duration': voice_caption.get_display_duration(),
                'quality_color': quality_status['color'],
                'created_at': voice_caption.created_at.strftime('%b %d, %H:%M'),
                'audio_url': audio_url,
                'is_processed': voice_caption.is_processed(),
                'text_caption': voice_caption.text_caption if voice_caption.is_processed() else None
            }
        })
        
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)

@login_required
def delete_voice_caption(request, scanpair_id, caption_id):
    if request.method != 'DELETE':
        return JsonResponse({'error': 'Method not allowed'}, status=405)
    
    scan_pair = get_object_or_404(ScanPair, scanpair_id=scanpair_id)
    voice_caption = get_object_or_404(VoiceCaption, id=caption_id, scanpair=scan_pair)
    
    # Check permissions - only allow the user who created it or annotators to delete
    user_profile = getattr(request.user, 'userprofile', None)
    if voice_caption.user != request.user and (not user_profile or not user_profile.is_annotator):
        return JsonResponse({'error': 'Permission denied'}, status=403)
    
    try:
        # Delete the audio file from storage
        if voice_caption.audio_file:
            voice_caption.audio_file.delete(save=False)
        
        # Delete the caption
        voice_caption.delete()
        
        return JsonResponse({'success': True})
        
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)
