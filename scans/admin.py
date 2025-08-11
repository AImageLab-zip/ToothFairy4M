from django.contrib import admin
from .models import UserProfile, Dataset, Patient, ScanPair, Classification, VoiceCaption, ProcessingJob, FileRegistry, Invitation


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
            return self.readonly_fields + ['scanpair', 'user']
        return self.readonly_fields


@admin.register(ProcessingJob)
class ProcessingJobAdmin(admin.ModelAdmin):
    list_display = ['id', 'job_type', 'status', 'scanpair', 'voice_caption', 'priority', 'dependencies_count', 'created_at', 'started_at', 'completed_at', 'retry_count']
    list_filter = ['job_type', 'status', 'created_at', 'started_at', 'completed_at', 'priority', ('dependencies', admin.EmptyFieldListFilter)]
    search_fields = ['scanpair__scanpair_id', 'scanpair__patient__patient_id', 'voice_caption__id', 'worker_id']
    readonly_fields = ['created_at', 'started_at', 'completed_at', 'dependencies_list']
    
    fieldsets = (
        ('Job Information', {
            'fields': ('job_type', 'status', 'priority', 'scanpair', 'voice_caption')
        }),
        ('Dependencies', {
            'fields': ('dependencies', 'dependencies_list'),
            'description': 'Jobs that must complete before this job can start'
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
    
    def dependencies_count(self, obj):
        """Display the number of dependencies for this job"""
        count = obj.dependencies.count()
        if count == 0:
            return "-"
        return f"{count} dep(s)"
    dependencies_count.short_description = "Dependencies"
    
    def dependencies_list(self, obj):
        """Display a list of dependency job IDs"""
        deps = obj.dependencies.all()[:3]  # Show first 3 dependencies
        if not deps:
            return "-"
        dep_ids = [f"#{dep.id}" for dep in deps]
        if obj.dependencies.count() > 3:
            dep_ids.append(f"... (+{obj.dependencies.count() - 3} more)")
        return ", ".join(dep_ids)
    dependencies_list.short_description = "Dependency Jobs"
    
    def get_queryset(self, request):
        """Optimize queryset to include dependencies count"""
        return super().get_queryset(request).prefetch_related('dependencies')
    
    def get_fieldsets(self, request, obj=None):
        """Customize fieldsets based on job status"""
        fieldsets = list(super().get_fieldsets(request, obj))
        
        # Add dependent jobs info if this job has dependents
        if obj and obj.dependent_jobs.exists():
            dependent_info = {
                'fields': (),
                'description': f'This job has {obj.dependent_jobs.count()} dependent job(s) waiting for it to complete'
            }
            fieldsets.append(('Dependent Jobs', dependent_info))
        
        return fieldsets
    
    actions = ['retry_failed_jobs', 'cancel_pending_jobs', 'check_dependencies', 'clear_dependencies']
    
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
        count = queryset.filter(status__in=['pending', 'retrying']).update(status='failed')
        self.message_user(request, f'Marked {count} pending job(s) as failed.')
    cancel_pending_jobs.short_description = "Mark selected pending jobs as failed"
    
    def check_dependencies(self, request, queryset):
        """Check and update dependency status for selected jobs"""
        count = 0
        for job in queryset:
            if job.update_status_based_on_dependencies():
                count += 1
        self.message_user(request, f'Updated dependency status for {count} job(s).')
    check_dependencies.short_description = "Check and update dependency status"
    
    def clear_dependencies(self, request, queryset):
        """Clear all dependencies for selected jobs"""
        count = 0
        for job in queryset:
            if job.dependencies.exists():
                job.dependencies.clear()
                job.update_status_based_on_dependencies()
                count += 1
        self.message_user(request, f'Cleared dependencies for {count} job(s).')
    clear_dependencies.short_description = "Clear all dependencies"


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



@admin.register(Invitation)
class InvitationAdmin(admin.ModelAdmin):
    list_display = ['code', 'email', 'role', 'created_by', 'created_at', 'expires_at', 'used_at', 'used_by']
    list_filter = ['role', 'created_at', 'expires_at']
    search_fields = ['code', 'email', 'created_by__username', 'used_by__username']
    readonly_fields = ['code', 'created_at', 'used_at', 'used_by']

    def get_readonly_fields(self, request, obj=None):
        if obj:  # Editing existing object
            return self.readonly_fields + ['created_by']
        return self.readonly_fields



