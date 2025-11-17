from django.urls import path
from django.shortcuts import redirect

app_name = 'maxillo'
from . import views
from . import api_views

urlpatterns = [
    path('', views.home, name='home'),
    path('patients/', views.patient_list, name='patient_list'),
    path('upload/', views.upload_patient, name='upload_patient'),
    path('project/<int:project_id>/select/', views.select_project, name='select_project'),
    path('patient/<int:patient_id>/', views.patient_detail, name='patient_detail'),
    path('patient/<int:patient_id>/update/', views.update_classification, name='update_classification'),
    path('patient/<int:patient_id>/update-name/', views.update_patient_name, name='update_patient_name'),
    path('patient/<int:patient_id>/voice-caption/', views.upload_voice_caption, name='upload_voice_caption'),
    path('patient/<int:patient_id>/text-caption/', views.upload_text_caption, name='upload_text_caption'),
    path('patient/<int:patient_id>/voice-caption/<int:caption_id>/delete/', views.delete_voice_caption, name='delete_voice_caption'),
    path('patient/<int:patient_id>/voice-caption/<int:caption_id>/edit/', views.edit_voice_caption_transcription, name='edit_voice_caption_transcription'),
    path('patient/<int:patient_id>/voice-caption/<int:caption_id>/update-modality/', views.update_voice_caption_modality, name='update_voice_caption_modality'),
    path('patient/<int:patient_id>/tags/add/', views.add_patient_tag, name='add_patient_tag'),
    path('patient/<int:patient_id>/tags/remove/', views.remove_patient_tag, name='remove_patient_tag'),
    
    # Admin endpoints
    path('patient/<int:patient_id>/delete/', views.delete_patient, name='delete_patient'),
    path('patients/bulk-delete/', views.bulk_delete_patients, name='bulk_delete_patients'),
    path('patient/<int:patient_id>/rerun-processing/', views.rerun_processing, name='rerun_processing'),
    path('admin/control-panel/', lambda request: redirect('admin_control_panel'), name='admin_control_panel'),
    
    # Profile
    path('profile/', views.user_profile, name='user_profile'),
    path('profile/<str:username>/', views.user_profile, name='user_profile_by_username'),
    
    # Folder/tag management
    path('folders/create/', views.create_folder, name='create_folder'),
    path('folders/move-patients/', views.move_patients_to_folder, name='move_patients_to_folder'),
    
    # API endpoints
    path('api/patient/<int:patient_id>/data/', views.patient_viewer_data, name='patient_viewer_data'),
    path('api/patient/<int:patient_id>/cbct/', views.patient_cbct_data, name='patient_cbct_data'),
    path('api/patient/<int:patient_id>/panoramic/', views.patient_panoramic_data, name='patient_panoramic_data'),
    path('api/patient/<int:patient_id>/intraoral/', views.patient_intraoral_data, name='patient_intraoral_data'),
    path('api/patient/<int:patient_id>/intraoral-photo/', views.patient_intraoral_data, name='patient_intraoral_photo_data'),
    path('api/patient/<int:patient_id>/teleradiography/', views.patient_teleradiography_data, name='patient_teleradiography_data'),
    path('api/patient/<int:patient_id>/volume/<slug:modality_slug>/', views.patient_volume_data, name='patient_volume_data'),
    path('api/patient/<int:patient_id>/nifti-metadata/', views.get_nifti_metadata, name='get_nifti_metadata'),
    path('api/patient/<int:patient_id>/nifti-metadata/update/', views.update_nifti_metadata, name='update_nifti_metadata'),
    
    # Processing API endpoints for Docker containers
    path('api/processing/health/', api_views.health_check, name='api_health_check'),
    path('api/processing/jobs/', api_views.ProcessingJobListView.as_view(), name='api_processing_jobs'),
    path('api/processing/jobs/pending/<str:job_type>/', api_views.get_pending_jobs, name='api_get_pending_jobs'),
    path('api/processing/jobs/<int:job_id>/status/', api_views.get_job_status, name='api_get_job_status'),
    path('api/processing/jobs/<int:job_id>/processing/', api_views.mark_job_processing, name='api_mark_job_processing'),
    path('api/processing/jobs/<int:job_id>/completed/', api_views.mark_job_completed_api, name='api_mark_job_completed'),
    path('api/processing/jobs/<int:job_id>/failed/', api_views.mark_job_failed_api, name='api_mark_job_failed'),
    path('api/processing/files/', api_views.get_file_registry, name='api_get_file_registry'),
    path('api/processing/files/serve/<int:file_id>/', api_views.serve_file, name='api_serve_file'),
] 