from django.contrib import admin
from .models import UserProfile, Dataset, Patient, ScanPair, Classification, VoiceCaption, ProcessingJob, FileRegistry


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ['user', 'role']
    list_filter = ['role']
    search_fields = ['user__username', 'user__email']


@admin.register(Dataset)
class DatasetAdmin(admin.ModelAdmin):
    list_display = ['name', 'scan_count', 'patient_count', 'created_at', 'created_by']
    list_filter = ['created_at']
    search_fields = ['name', 'description']
    readonly_fields = ['created_at', 'scan_count', 'patient_count']


@admin.register(Patient)
class PatientAdmin(admin.ModelAdmin):
    list_display = ['patient_id', 'created_at']
    search_fields = ['patient_id']
    readonly_fields = ['patient_id', 'created_at']


@admin.register(ScanPair)
class ScanPairAdmin(admin.ModelAdmin):
    list_display = ['scanpair_id', 'name', 'patient', 'dataset', 'visibility', 'uploaded_at', 'uploaded_by']
    list_filter = ['visibility', 'dataset', 'uploaded_at']
    search_fields = ['scanpair_id', 'name', 'patient__patient_id']
    readonly_fields = ['uploaded_at']


@admin.register(Classification)
class ClassificationAdmin(admin.ModelAdmin):
    list_display = ['id', 'scanpair', 'classifier', 'sagittal_left', 'sagittal_right', 'vertical', 'transverse', 'midline', 'annotator', 'timestamp']
    list_filter = ['classifier', 'sagittal_left', 'sagittal_right', 'vertical', 'transverse', 'midline', 'timestamp']
    search_fields = ['scanpair__scanpair_id']
    readonly_fields = ['timestamp']


@admin.register(VoiceCaption)
class VoiceCaptionAdmin(admin.ModelAdmin):
    list_display = ['id', 'user', 'scanpair', 'modality', 'duration', 'processing_status', 'created_at']
    list_filter = ['modality', 'processing_status', 'created_at']
    search_fields = ['user__username', 'scanpair__scanpair_id', 'scanpair__patient__patient_id']
    readonly_fields = ['created_at', 'updated_at']
    
    def get_readonly_fields(self, request, obj=None):
        if obj:  # Editing an existing object
            return self.readonly_fields + ['scanpair', 'user', 'audio_file']
        return self.readonly_fields


@admin.register(ProcessingJob)
class ProcessingJobAdmin(admin.ModelAdmin):
    list_display = ['id', 'job_type', 'status', 'scanpair', 'voice_caption', 'priority', 'created_at', 'started_at', 'completed_at', 'retry_count']
    list_filter = ['job_type', 'status', 'created_at', 'started_at', 'completed_at']
    search_fields = ['scanpair__scanpair_id', 'scanpair__patient__patient_id', 'voice_caption__id', 'worker_id']
    readonly_fields = ['created_at', 'started_at', 'completed_at']
    
    fieldsets = (
        ('Job Information', {
            'fields': ('job_type', 'status', 'priority', 'scanpair', 'voice_caption')
        }),
        ('Files & Processing', {
            'fields': ('input_file_path', 'output_files', 'docker_image', 'docker_command')
        }),
        ('Timing', {
            'fields': ('created_at', 'started_at', 'completed_at')
        }),
        ('Error Handling', {
            'fields': ('retry_count', 'max_retries', 'error_logs')
        }),
        ('Worker Info', {
            'fields': ('worker_id',)
        }),
    )
    
    def get_readonly_fields(self, request, obj=None):
        if obj and obj.status in ['processing', 'completed']:
            # Prevent editing jobs that are being processed or completed
            return self.readonly_fields + ['job_type', 'scanpair', 'voice_caption', 'input_file_path', 'docker_image', 'docker_command']
        return self.readonly_fields
    
    actions = ['retry_failed_jobs', 'cancel_pending_jobs']
    
    def retry_failed_jobs(self, request, queryset):
        count = 0
        for job in queryset.filter(status='failed'):
            if job.can_retry():
                job.status = 'retrying'
                job.save()
                count += 1
        self.message_user(request, f'Retried {count} failed job(s).')
    retry_failed_jobs.short_description = "Retry selected failed jobs"
    
    def cancel_pending_jobs(self, request, queryset):
        count = queryset.filter(status__in=['pending', 'retrying']).update(status='cancelled')
        self.message_user(request, f'Cancelled {count} pending job(s).')
    cancel_pending_jobs.short_description = "Cancel selected pending jobs"


@admin.register(FileRegistry)
class FileRegistryAdmin(admin.ModelAdmin):  
    list_display = ['id', 'file_type', 'scanpair', 'voice_caption', 'file_size_mb', 'created_at']
    list_filter = ['file_type', 'created_at']
    search_fields = ['file_path', 'scanpair__scanpair_id', 'scanpair__patient__patient_id', 'voice_caption__id']
    readonly_fields = ['created_at', 'file_hash', 'file_size', 'file_size_mb']
    
    fieldsets = (
        ('File Information', {
            'fields': ('file_type', 'file_path', 'file_size', 'file_size_mb', 'file_hash')
        }),
        ('Related Objects', {
            'fields': ('scanpair', 'voice_caption', 'processing_job')
        }),
        ('Metadata', {
            'fields': ('metadata', 'created_at')
        }),
    )
    
    def file_size_mb(self, obj):
        """Display file size in MB"""
        if obj.file_size:
            return f"{obj.file_size / (1024 * 1024):.2f} MB"
        return "-"
    file_size_mb.short_description = "File Size (MB)"
    
    def get_readonly_fields(self, request, obj=None):
        if obj:  # Editing existing object
            return self.readonly_fields + ['file_type', 'file_path', 'scanpair', 'voice_caption', 'processing_job']
        return self.readonly_fields
