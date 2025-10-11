from django.urls import path
from . import api_views

app_name = 'api'

urlpatterns = [
    # Health
    path('processing/health/', api_views.health_check, name='api_health_check'),

    # Jobs
    path('processing/jobs/', api_views.ProcessingJobListView.as_view(), name='api_processing_jobs'),
    path('processing/jobs/pending/', api_views.get_pending_jobs_compat, name='api_get_pending_jobs_compat'),
    path('processing/jobs/pending/<str:job_type>/', api_views.get_pending_jobs, name='api_get_pending_jobs'),
    path('processing/jobs/<int:job_id>/status/', api_views.get_job_status, name='api_get_job_status'),
    path('processing/jobs/<int:job_id>/processing/', api_views.mark_job_processing, name='api_mark_job_processing'),
    path('processing/jobs/<int:job_id>/completed/', api_views.mark_job_completed_api, name='api_mark_job_completed'),
    path('processing/jobs/<int:job_id>/failed/', api_views.mark_job_failed_api, name='api_mark_job_failed'),

    # Files
    path('processing/files/', api_views.get_file_registry, name='api_get_file_registry'),
    path('processing/files/serve/<int:file_id>/', api_views.serve_file, name='api_serve_file'),

    # Project-based API endpoints
    path('<str:project_slug>/upload/', api_views.project_upload_api, name='api_project_upload'),
    path('<str:project_slug>/folders/', api_views.get_project_folders, name='api_project_folders'),
    path('<str:project_slug>/patients/', api_views.project_patients_handler, name='api_project_patients'),
    path('<str:project_slug>/patients/<int:patient_id>/files/', api_views.get_patient_files, name='api_get_patient_files'),
]



