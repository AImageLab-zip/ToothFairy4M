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


class ScanPair(models.Model):
    VISIBILITY_CHOICES = [
        ('public', 'Public'),
        ('private', 'Private'),
    ]
    
    scanpair_id = models.AutoField(primary_key=True)
    patient = models.ForeignKey(Patient, on_delete=models.CASCADE, related_name='scan_pairs')
    dataset = models.ForeignKey(Dataset, on_delete=models.SET_NULL, null=True, blank=True, related_name='scan_pairs')
    name = models.CharField(max_length=100, blank=True)
    
    upper_scan_raw = models.FileField(
        upload_to=scan_upload_path,
        validators=[FileExtensionValidator(allowed_extensions=['stl'])]
    )
    lower_scan_raw = models.FileField(
        upload_to=scan_upload_path,
        validators=[FileExtensionValidator(allowed_extensions=['stl'])]
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
    
    visibility = models.CharField(max_length=10, choices=VISIBILITY_CHOICES, default='private')
    uploaded_at = models.DateTimeField(auto_now_add=True)
    uploaded_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    
    def save(self, *args, **kwargs):
        if not self.name:
            self.name = f"Patient {self.patient.patient_id}"
        super().save(*args, **kwargs)
    
    def __str__(self):
        return f"ScanPair {self.scanpair_id} - {self.name}"


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
