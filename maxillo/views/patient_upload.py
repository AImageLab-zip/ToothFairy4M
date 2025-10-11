"""Patient upload view."""
from django.shortcuts import render
from django.contrib.auth.decorators import login_required
from django.contrib import messages

from ..models import Patient, Project, ProjectAccess, Folder
from ..forms import PatientForm, PatientUploadForm
from .helpers import redirect_with_namespace


@login_required
def upload_patient(request):
    user_profile = request.user.profile
    
    if not user_profile.can_upload_scans():
        messages.error(request, 'You do not have permission to upload scans.')
        return redirect_with_namespace(request, 'patient_list')
    
    # Enforce per-project upload permission
    current_project_id = request.session.get('current_project_id')
    if not user_profile.is_admin() and current_project_id:
        has_upload_access = ProjectAccess.objects.filter(
            user=request.user, 
            project_id=current_project_id, 
            can_upload=True
        ).exists()
        if not has_upload_access:
            messages.error(request, 'You are not allowed to upload in this project.')
            return redirect_with_namespace(request, 'patient_list')
    
    if request.method == 'POST':
        patient_upload_form = PatientUploadForm(request.POST, request.FILES, user=request.user)
        patient_form = PatientForm()

        # For now, we do not support CBCT folder uploads
        cbct_upload_type = request.POST.get('cbct_upload_type', 'file')
        if cbct_upload_type == 'folder' and request.FILES.getlist('cbct_folder_files'):
            messages.error(request, 'CBCT Folder uploads have been disabled.')
            return render(request, 'common/upload/upload.html', {
                'patient_form': patient_form,
                'patient_upload_form': patient_upload_form,
                'folders': Folder.objects.filter(parent__isnull=True).order_by('name'),
            })

        if patient_upload_form.is_valid():
            # Create and populate Patient from the form
            patient: Patient = patient_upload_form.save(commit=False)
            patient.uploaded_by = request.user
            
            if user_profile.is_student_developer():
                patient.visibility = 'debug'
                
            # Assign Maxillo project
            if not patient.project:
                patient.project = Project.objects.filter(name='Maxillo').first()
                
            # Assign folder if provided
            folder = patient_upload_form.cleaned_data.get('folder')
            if folder:
                patient.folder = folder
            patient.save()

            # The form's save() handles tags
            patient_upload_form.instance = patient
            patient_upload_form.save(commit=True)

            # Add modalities to patient
            from common.models import Modality
            
            # Handle CBCT (single file or folder)
            cbct_file = request.FILES.get('cbct')
            cbct_folder_files = request.FILES.getlist('cbct_folder_files')
            if cbct_file or cbct_folder_files:
                try:
                    modality = Modality.objects.get(slug='cbct')
                    patient.modalities.add(modality)
                    
                    # Update processing status
                    patient.cbct_processing_status = 'processing'
                    patient.save()
                    
                    if cbct_file:
                        from ..file_utils import save_generic_modality_file
                        fr, job = save_generic_modality_file(patient, 'cbct', cbct_file)
                        if fr:
                            messages.success(request, "CBCT file uploaded successfully")
                            if job:
                                messages.success(request, f"CBCT queued for processing (Job #{job.id})")
                    elif cbct_folder_files:
                        from ..file_utils import save_generic_modality_folder
                        fr, job = save_generic_modality_folder(patient, 'cbct', cbct_folder_files)
                        if fr:
                            messages.success(request, "CBCT folder uploaded successfully")
                            if job:
                                messages.success(request, f"CBCT queued for processing (Job #{job.id})")
                except Exception as e:
                    messages.error(request, f"Error saving CBCT: {e}")

            # Handle IOS (upper + lower)
            ios_upper = request.FILES.get('ios_upper')
            ios_lower = request.FILES.get('ios_lower')
            if ios_upper and ios_lower:
                try:
                    modality = Modality.objects.get(slug='ios')
                    patient.modalities.add(modality)
                    
                    # Update processing status
                    patient.ios_processing_status = 'processing'
                    patient.save()
                    
                    from ..file_utils import save_ios_to_dataset
                    ios_result = save_ios_to_dataset(patient, ios_upper, ios_lower)
                    if ios_result.get('processing_job'):
                        messages.success(request, f"IOS scans uploaded and queued for processing (Job #{ios_result['processing_job'].id})")
                    if ios_result.get('bite_classification_job'):
                        messages.success(request, f"Bite classification job #{ios_result['bite_classification_job'].id} created")
                except Exception as e:
                    messages.error(request, f"Error saving IOS: {e}")

            # Handle Teleradiography
            teleradiography_file = request.FILES.get('teleradiography')
            if teleradiography_file:
                try:
                    modality = Modality.objects.get(slug='teleradiography')
                    patient.modalities.add(modality)
                    
                    from ..file_utils import save_generic_modality_file
                    fr, job = save_generic_modality_file(patient, 'teleradiography', teleradiography_file)
                    if fr:
                        messages.success(request, "Teleradiography uploaded successfully")
                except Exception as e:
                    messages.error(request, f"Error saving Teleradiography: {e}")

            # Handle Panoramic
            panoramic_file = request.FILES.get('panoramic')
            if panoramic_file:
                try:
                    modality = Modality.objects.get(slug='panoramic')
                    patient.modalities.add(modality)
                    
                    from ..file_utils import save_generic_modality_file
                    fr, job = save_generic_modality_file(patient, 'panoramic', panoramic_file)
                    if fr:
                        messages.success(request, "Panoramic uploaded successfully")
                except Exception as e:
                    messages.error(request, f"Error saving Panoramic: {e}")

            # Handle Intraoral Photos (multiple files)
            intraoral_photos = request.FILES.getlist('intraoral-photos')
            if intraoral_photos:
                try:
                    modality = Modality.objects.get(slug='intraoral-photo')
                    patient.modalities.add(modality)
                    
                    if len(intraoral_photos) > 10:
                        messages.warning(request, f"Too many intraoral images ({len(intraoral_photos)}). Only first 10 will be processed.")
                        intraoral_photos = intraoral_photos[:10]
                    
                    from ..file_utils import save_intraoral_photos_to_dataset
                    saved, errors, job = save_intraoral_photos_to_dataset(patient, intraoral_photos)
                    if saved:
                        messages.success(request, f"Uploaded {len(saved)} intraoral photograph(s) successfully")
                    if errors:
                        messages.warning(request, f"{len(errors)} intraoral photo(s) failed to upload")
                except Exception as e:
                    messages.error(request, f"Error saving Intraoral Photos: {e}")

            messages.success(request, 'Patient uploaded successfully!')
            return redirect_with_namespace(request, 'patient_list')
    else:
        patient_form = PatientForm()
        patient_upload_form = PatientUploadForm(user=request.user)
    
    folders = Folder.objects.filter(parent__isnull=True).order_by('name')
    
    # Get allowed modalities for template rendering
    allowed_modalities = []
    cp_id = request.session.get('current_project_id')
    if cp_id:
        try:
            proj = Project.objects.prefetch_related('modalities').get(id=cp_id)
            allowed_modalities = list(proj.modalities.filter(is_active=True))
        except Project.DoesNotExist:
            pass
    
    context = {
        'patient_form': patient_form,
        'patient_upload_form': patient_upload_form,
        'folders': folders,
        'allowed_modalities': allowed_modalities,
    }
    return render(request, 'common/upload/upload.html', context)

