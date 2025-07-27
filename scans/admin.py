from django.contrib import admin
from .models import UserProfile, Dataset, Patient, ScanPair, Classification


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
