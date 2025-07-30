from django.urls import path
from . import views
from . import api_views

urlpatterns = [
    path('', views.scan_list, name='scan_list'),
    path('home/', views.home, name='home'),
    path('upload/', views.upload_scan, name='upload_scan'),
    path('scan/<int:scanpair_id>/', views.scan_detail, name='scan_detail'),
    path('scan/<int:scanpair_id>/update/', views.update_classification, name='update_classification'),
    path('scan/<int:scanpair_id>/update-name/', views.update_scan_name, name='update_scan_name'),
    path('scan/<int:scanpair_id>/voice-caption/', views.upload_voice_caption, name='upload_voice_caption'),
    path('scan/<int:scanpair_id>/voice-caption/<int:caption_id>/delete/', views.delete_voice_caption, name='delete_voice_caption'),
    
    # API endpoints
    path('api/scan/<int:scanpair_id>/data/', views.scan_viewer_data, name='scan_viewer_data'),
    path('api/scan/<int:scanpair_id>/cbct/', views.scan_cbct_data, name='scan_cbct_data'),
    
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