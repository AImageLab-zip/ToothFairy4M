from django.db import models
from django.contrib.auth.models import User
from django.core.validators import FileExtensionValidator
import os
from django.utils import timezone


class UserProfile(models.Model):
    ROLE_CHOICES = [
        ('standard', 'Standard User'),
        ('annotator', 'Annotator'),
        ('admin', 'Administrator'),
    ]
    
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    role = models.CharField(max_length=10, choices=ROLE_CHOICES, default='standard')
    
    def __str__(self):
        return f"{self.user.username} - {self.get_role_display()}"
    
    def is_annotator(self):
        return self.role in ['annotator', 'admin']
    
    def is_admin(self):
        return self.role == 'admin'


class Dataset(models.Model):
    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    
    def __str__(self):
        return self.name
    
    def scan_count(self):
        return self.scan_pairs.count()
    
    def patient_count(self):
        return self.scan_pairs.values('patient').distinct().count()


class Patient(models.Model):
    patient_id = models.AutoField(primary_key=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    def __str__(self):
        return f"Patient {self.patient_id}"


def scan_upload_path(instance, filename):
    return f"scans/patient_{instance.patient.patient_id}/raw/{filename}"


def normalized_scan_path(instance, filename):
    return f"scans/patient_{instance.patient.patient_id}/normalized/{filename}"


def cbct_upload_path(instance, filename):
    return f"scans/patient_{instance.patient.patient_id}/cbct/{filename}"


def voice_caption_upload_path(instance, filename):
    return f"scans/patient_{instance.scanpair.patient.patient_id}/voice_captions/{filename}"


class ScanPair(models.Model):
    VISIBILITY_CHOICES = [
        ('public', 'Public'),
        ('private', 'Private'),
    ]
    
    # Processing status choices
    PROCESSING_STATUS_CHOICES = [
        ('not_uploaded', 'Not Uploaded'),
        ('processing', 'Processing'),
        ('processed', 'Processed'),
        ('failed', 'Processing Failed'),
    ]
    
    scanpair_id = models.AutoField(primary_key=True)
    patient = models.ForeignKey(Patient, on_delete=models.CASCADE, related_name='scan_pairs')
    dataset = models.ForeignKey(Dataset, on_delete=models.SET_NULL, null=True, blank=True, related_name='scan_pairs')
    name = models.CharField(max_length=100, blank=True)
    
    upper_scan_raw = models.FileField(
        upload_to=scan_upload_path,
        validators=[FileExtensionValidator(allowed_extensions=['stl'])],
        blank=True,
        null=True
    )
    lower_scan_raw = models.FileField(
        upload_to=scan_upload_path,
        validators=[FileExtensionValidator(allowed_extensions=['stl'])],
        blank=True,
        null=True
    )
    
    upper_scan_norm = models.FileField(
        upload_to=normalized_scan_path,
        validators=[FileExtensionValidator(allowed_extensions=['stl'])],
        blank=True,
        null=True
    )
    lower_scan_norm = models.FileField(
        upload_to=normalized_scan_path,
        validators=[FileExtensionValidator(allowed_extensions=['stl'])],
        blank=True,
        null=True
    )
    
    cbct = models.FileField(
        upload_to=cbct_upload_path,
        validators=[FileExtensionValidator(allowed_extensions=['nii', 'gz'])],
        blank=True,
        null=True
    )
    
    # Processing status fields
    ios_processing_status = models.CharField(
        max_length=20, 
        choices=PROCESSING_STATUS_CHOICES, 
        default='not_uploaded',
        help_text='Processing status for intra-oral scans (upper and lower)'
    )
    cbct_processing_status = models.CharField(
        max_length=20, 
        choices=PROCESSING_STATUS_CHOICES, 
        default='not_uploaded',
        help_text='Processing status for CBCT scan'
    )
    
    visibility = models.CharField(max_length=10, choices=VISIBILITY_CHOICES, default='private')
    uploaded_at = models.DateTimeField(auto_now_add=True)
    uploaded_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    
    def save(self, *args, **kwargs):
        if not self.name:
            self.name = f"Patient {self.patient.patient_id}"
        
        # Legacy processing status logic - now we use FileRegistry and ProcessingJob
        # Only update status automatically if we're still using the old file fields
        if self.upper_scan_raw and self.lower_scan_raw:
            if self.ios_processing_status == 'not_uploaded':
                self.ios_processing_status = 'processing'
        # Don't automatically reset to 'not_uploaded' if files are empty - 
        # they might be in FileRegistry now
            
        if self.cbct:
            if self.cbct_processing_status == 'not_uploaded':
                self.cbct_processing_status = 'processing'
        # Don't automatically reset to 'not_uploaded' if files are empty -
        # they might be in FileRegistry now
            
        super().save(*args, **kwargs)
    
    def __str__(self):
        return f"ScanPair {self.scanpair_id} - {self.name}"
    
    def has_ios_scans(self):
        """Check if both upper and lower scans are uploaded"""
        # Check old file fields first (for backward compatibility)
        if self.upper_scan_raw and self.lower_scan_raw:
            return True
        
        # Check FileRegistry for new processing flow
        try:
            # Check for both raw and processed files
            upper_raw = self.files.filter(file_type='ios_raw_upper').exists()
            lower_raw = self.files.filter(file_type='ios_raw_lower').exists()
            upper_processed = self.files.filter(file_type='ios_processed_upper').exists()
            lower_processed = self.files.filter(file_type='ios_processed_lower').exists()
            
            # Return True if we have either raw or processed files for both upper and lower
            return (upper_raw or upper_processed) and (lower_raw or lower_processed)
        except Exception as e:
            print(f"Error checking IOS files for scanpair {self.scanpair_id}: {e}")
            return False
        
    def has_cbct_scan(self):
        """Check if CBCT scan is uploaded"""
        # Check old file field first (for backward compatibility)
        if self.cbct:
            return True
            
        # Check FileRegistry for new processing flow
        try:
            # Check for both raw and processed CBCT files
            has_raw = self.files.filter(file_type='cbct_raw').exists()
            has_processed = self.files.filter(file_type='cbct_processed').exists()
            return has_raw or has_processed
        except Exception as e:
            print(f"Error checking CBCT files for scanpair {self.scanpair_id}: {e}")
            return False
        
    def is_ios_processed(self):
        """Check if IOS processing is complete"""
        return self.ios_processing_status == 'processed'
        
    def is_cbct_processed(self):
        """Check if CBCT processing is complete"""
        return self.cbct_processing_status == 'processed'
    
    # New methods for working with FileRegistry system
    def get_raw_files(self):
        """Get all raw files from FileRegistry"""
        return self.files.filter(
            file_type__in=['cbct_raw', 'ios_raw_upper', 'ios_raw_lower', 'audio_raw']
        )
    
    def get_processed_files(self):
        """Get all processed files from FileRegistry"""
        return self.files.filter(
            file_type__in=['cbct_processed', 'ios_processed_upper', 'ios_processed_lower', 'audio_processed']
        )
    
    def get_cbct_raw_file(self):
        """Get CBCT raw file from FileRegistry"""
        try:
            return self.files.get(file_type='cbct_raw')
        except FileRegistry.DoesNotExist:
            return None
    
    def get_cbct_processed_file(self):
        """Get CBCT processed file from FileRegistry"""
        try:
            return self.files.get(file_type='cbct_processed')
        except FileRegistry.DoesNotExist:
            return None
    
    def get_ios_raw_files(self):
        """Get IOS raw files from FileRegistry"""
        upper = None
        lower = None
        try:
            upper = self.files.get(file_type='ios_raw_upper')
        except FileRegistry.DoesNotExist:
            pass
        try:
            lower = self.files.get(file_type='ios_raw_lower')
        except FileRegistry.DoesNotExist:
            pass
        return {'upper': upper, 'lower': lower}
    
    def get_ios_processed_files(self):
        """Get IOS processed files from FileRegistry"""
        upper = None
        lower = None
        try:
            upper = self.files.get(file_type='ios_processed_upper')
        except FileRegistry.DoesNotExist:
            pass
        try:
            lower = self.files.get(file_type='ios_processed_lower')
        except FileRegistry.DoesNotExist:
            pass
        return {'upper': upper, 'lower': lower}
    
    def has_ios_scans_new(self):
        """Check if both upper and lower scans are available in FileRegistry"""
        ios_files = self.get_ios_raw_files()
        return ios_files['upper'] is not None and ios_files['lower'] is not None
        
    def has_cbct_scan_new(self):
        """Check if CBCT scan is available in FileRegistry"""
        return self.get_cbct_raw_file() is not None
    
    def get_pending_jobs(self):
        """Get pending processing jobs for this scan pair"""
        return self.processing_jobs.filter(status__in=['pending', 'processing', 'retrying'])
    
    def get_completed_jobs(self):
        """Get completed processing jobs for this scan pair"""
        return self.processing_jobs.filter(status='completed')
    
    def get_failed_jobs(self):
        """Get failed processing jobs for this scan pair"""
        return self.processing_jobs.filter(status='failed')


class Classification(models.Model):
    CLASSIFIER_CHOICES = [
        ('manual', 'Manual'),
        ('pipeline', 'Pipeline'),
    ]
    
    SAGITTAL_CHOICES = [
        ('I', 'Class I'),
        ('II_edge', 'Class II Edge'),
        ('II_full', 'Class II Full'),
        ('III', 'Class III'),
    ]
    
    VERTICAL_CHOICES = [
        ('normal', 'Normal'),
        ('deep', 'Deep Bite'),
        ('reverse', 'Reverse Bite'),
        ('open', 'Open Bite'),
    ]
    
    TRANSVERSE_CHOICES = [
        ('normal', 'Normal'),
        ('cross', 'Cross Bite'),
        ('scissor', 'Scissor Bite'),
    ]
    
    MIDLINE_CHOICES = [
        ('centered', 'Centered'),
        ('deviated', 'Deviated'),
    ]
    
    scanpair = models.ForeignKey(ScanPair, on_delete=models.CASCADE, related_name='classifications')
    classifier = models.CharField(max_length=10, choices=CLASSIFIER_CHOICES)
    
    sagittal_left = models.CharField(max_length=10, choices=SAGITTAL_CHOICES)
    sagittal_right = models.CharField(max_length=10, choices=SAGITTAL_CHOICES)
    vertical = models.CharField(max_length=10, choices=VERTICAL_CHOICES)
    transverse = models.CharField(max_length=10, choices=TRANSVERSE_CHOICES)
    midline = models.CharField(max_length=10, choices=MIDLINE_CHOICES)
    
    annotator = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    timestamp = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['-timestamp']
    
    def __str__(self):
        return f"Classification {self.id} - {self.get_classifier_display()} - ScanPair {self.scanpair.scanpair_id}"


class VoiceCaption(models.Model):
    PROCESSING_STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('processing', 'Processing'),
        ('completed', 'Completed'),
        ('failed', 'Failed'),
    ]
    
    MODALITY_CHOICES = [
        ('ios', 'Intra-Oral Scans'),
        ('cbct', 'CBCT'),
    ]
    
    scanpair = models.ForeignKey(ScanPair, on_delete=models.CASCADE, related_name='voice_captions')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='voice_captions')
    modality = models.CharField(max_length=10, choices=MODALITY_CHOICES, default='ios', help_text='Whether this caption describes IOS or CBCT scans')
    # Note: audio_file now stored in FileRegistry, not directly in model
    duration = models.FloatField(help_text='Duration of audio recording in seconds')
    text_caption = models.TextField(blank=True, null=True, help_text='Transcribed text from audio')
    processing_status = models.CharField(max_length=20, choices=PROCESSING_STATUS_CHOICES, default='pending', help_text='Status of speech-to-text processing')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-created_at']
    
    def get_display_duration(self):
        """Return a human-readable duration string"""
        minutes = int(self.duration // 60)
        seconds = int(self.duration % 60)
        if minutes > 0:
            return f"{minutes}:{seconds:02d}"
        return f"{seconds}s"
    
    def get_quality_status(self):
        """Return quality status based on duration"""
        if self.duration < 30:
            return {'color': 'danger', 'message': 'Short'}
        elif self.duration <= 45:
            return {'color': 'warning', 'message': 'Good'}
        else:
            return {'color': 'success', 'message': 'Perfect'}
    
    def is_processed(self):
        """Check if speech-to-text processing is complete"""
        return self.processing_status == 'completed' and self.text_caption and self.text_caption != "[Audio processed but no transcription available]"
    
    def get_processing_display_text(self):
        """Get display text based on processing status"""
        if self.processing_status == 'completed':
            if self.text_caption and self.text_caption != "[Audio processed but no transcription available]":
                return self.text_caption
            else:
                return "[Audio processed but no transcription available]"
        elif self.processing_status == 'processing':
            return "Converting speech to text..."
        elif self.processing_status == 'failed':
            return "Processing failed"
        else:
            return "Preprocessing audio..."
    
    def get_audio_file(self):
        """Get audio file from FileRegistry"""
        try:
            return self.files.get(file_type='audio_raw')
        except FileRegistry.DoesNotExist:
            return None
    
    def get_processed_text_file(self):
        """Get processed text file from FileRegistry"""
        try:
            return self.files.get(file_type='audio_processed')
        except FileRegistry.DoesNotExist:
            return None
    
    def get_pending_jobs(self):
        """Get pending processing jobs for this voice caption"""
        return self.processing_jobs.filter(status__in=['pending', 'processing', 'retrying'])


class ProcessingJob(models.Model):
    """
    Central processing job queue for all file types (CBCT, IOS, Audio)
    """
    JOB_TYPE_CHOICES = [
        ('cbct', 'CBCT Processing'),
        ('ios', 'IOS Processing'),
        ('audio', 'Audio Speech-to-Text'),
    ]
    
    JOB_STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('processing', 'Processing'),
        ('completed', 'Completed'),
        ('failed', 'Failed'),
        ('retrying', 'Retrying'),
    ]
    
    # Basic job info
    job_type = models.CharField(max_length=10, choices=JOB_TYPE_CHOICES)
    status = models.CharField(max_length=20, choices=JOB_STATUS_CHOICES, default='pending')
    priority = models.IntegerField(default=0, help_text='Higher values = higher priority')
    
    # Related objects
    scanpair = models.ForeignKey(ScanPair, on_delete=models.CASCADE, related_name='processing_jobs', null=True, blank=True)
    voice_caption = models.ForeignKey(VoiceCaption, on_delete=models.CASCADE, related_name='processing_jobs', null=True, blank=True)
    
    # File paths
    input_file_path = models.CharField(max_length=500, help_text='Path to input file in /dataset')
    output_files = models.JSONField(default=dict, blank=True, help_text='Dict of output file paths and metadata')
    
    # Processing info
    docker_image = models.CharField(max_length=200, help_text='Docker image used for processing')
    docker_command = models.JSONField(default=list, help_text='Docker command arguments')
    
    # Timing and metadata
    created_at = models.DateTimeField(auto_now_add=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    
    # Error handling
    retry_count = models.IntegerField(default=0)
    max_retries = models.IntegerField(default=3)
    error_logs = models.TextField(blank=True, help_text='Error logs if processing failed')
    
    # Worker info
    worker_id = models.CharField(max_length=100, blank=True, help_text='ID of worker processing this job')
    
    class Meta:
        ordering = ['-priority', 'created_at']
        indexes = [
            models.Index(fields=['job_type', 'status']),
            models.Index(fields=['status', 'created_at']),
        ]
    
    def __str__(self):
        related_obj = self.scanpair or self.voice_caption
        return f"ProcessingJob {self.id} - {self.get_job_type_display()} - {self.get_status_display()} - {related_obj}"
    
    def can_retry(self):
        """Check if job can be retried"""
        return self.status == 'failed' and self.retry_count < self.max_retries
    
    def mark_processing(self, worker_id=None):
        """Mark job as being processed"""
        self.status = 'processing'
        self.started_at = timezone.now()
        if worker_id:
            self.worker_id = worker_id
        self.save()
    
    def mark_completed(self, output_files=None):
        """Mark job as completed with optional output file info"""
        self.status = 'completed'
        self.completed_at = timezone.now()
        if output_files:
            self.output_files = output_files
        self.save()
    
    def mark_failed(self, error_msg, can_retry=True):
        """Mark job as failed with error message"""
        self.error_logs = error_msg
        if can_retry and self.can_retry():
            self.status = 'retrying'
            self.retry_count += 1
        else:
            self.status = 'failed'
        self.save()
    
    def get_processing_duration(self):
        """Get processing duration if completed"""
        if self.started_at and self.completed_at:
            return self.completed_at - self.started_at
        return None


class FileRegistry(models.Model):
    """
    Registry of all files in the /dataset and /database directories
    """
    FILE_TYPE_CHOICES = [
        ('cbct_raw', 'CBCT Raw'),
        ('cbct_processed', 'CBCT Processed'),
        ('ios_raw_upper', 'IOS Raw Upper'),
        ('ios_raw_lower', 'IOS Raw Lower'),
        ('ios_processed_upper', 'IOS Processed Upper'),
        ('ios_processed_lower', 'IOS Processed Lower'),
        ('audio_raw', 'Audio Raw'),
        ('audio_processed', 'Audio Processed Text'),
    ]
    
    # File identification
    file_type = models.CharField(max_length=20, choices=FILE_TYPE_CHOICES)
    file_path = models.CharField(max_length=500, unique=True, help_text='Full path to file')
    file_size = models.BigIntegerField(help_text='File size in bytes')
    file_hash = models.CharField(max_length=64, help_text='SHA256 hash of file')
    
    # Related objects
    scanpair = models.ForeignKey(ScanPair, on_delete=models.CASCADE, related_name='files', null=True, blank=True)
    voice_caption = models.ForeignKey(VoiceCaption, on_delete=models.CASCADE, related_name='files', null=True, blank=True)
    processing_job = models.ForeignKey(ProcessingJob, on_delete=models.CASCADE, related_name='files', null=True, blank=True)
    
    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)
    metadata = models.JSONField(default=dict, blank=True, help_text='Additional file metadata')
    
    class Meta:
        indexes = [
            models.Index(fields=['file_type', 'scanpair']),
            models.Index(fields=['file_path']),
        ]
    
    def __str__(self):
        return f"FileRegistry {self.id} - {self.get_file_type_display()} - {self.file_path}"
