"""
API Views package for maxillo app.

This package re-exports all API views from submodules for backwards compatibility.
"""

# Health check
from .health import health_check

# Jobs
from .jobs import (
    get_pending_jobs,
    get_pending_jobs_compat,
    mark_job_processing,
    mark_job_completed_api,
    mark_job_failed_api,
    get_job_status,
    ProcessingJobListView,
)

# Files
from .files import serve_file, get_file_registry

# Projects
from .projects import (
    project_upload_api,
    get_project_folders,
    project_patients_handler,
    get_project_patients_and_modalities,
    get_patient_files,
    get_multiple_patients_files,
)

# Export all functions
__all__ = [
    # Health
    'health_check',
    # Jobs
    'get_pending_jobs',
    'get_pending_jobs_compat',
    'mark_job_processing',
    'mark_job_completed_api',
    'mark_job_failed_api',
    'get_job_status',
    'ProcessingJobListView',
    # Files
    'serve_file',
    'get_file_registry',
    # Projects
    'project_upload_api',
    'get_project_folders',
    'project_patients_handler',
    'get_project_patients_and_modalities',
    'get_patient_files',
    'get_multiple_patients_files',
]

