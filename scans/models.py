from django.db import models
from django.contrib.auth.models import User
from django.core.validators import FileExtensionValidator
import os


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
        
        # Update processing status based on file availability
        if self.upper_scan_raw and self.lower_scan_raw:
            if self.ios_processing_status == 'not_uploaded':
                self.ios_processing_status = 'processing'
        else:
            self.ios_processing_status = 'not_uploaded'
            
        if self.cbct:
            if self.cbct_processing_status == 'not_uploaded':
                self.cbct_processing_status = 'processing'
        else:
            self.cbct_processing_status = 'not_uploaded'
            
        super().save(*args, **kwargs)
    
    def __str__(self):
        return f"ScanPair {self.scanpair_id} - {self.name}"
    
    def has_ios_scans(self):
        """Check if both upper and lower scans are uploaded"""
        return bool(self.upper_scan_raw and self.lower_scan_raw)
        
    def has_cbct_scan(self):
        """Check if CBCT scan is uploaded"""
        return bool(self.cbct)
        
    def is_ios_processed(self):
        """Check if IOS processing is complete"""
        return self.ios_processing_status == 'processed'
        
    def is_cbct_processed(self):
        """Check if CBCT processing is complete"""
        return self.cbct_processing_status == 'processed'


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
