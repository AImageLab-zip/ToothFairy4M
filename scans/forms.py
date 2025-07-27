from django import forms
from .models import Patient, ScanPair, Classification, Dataset


class PatientForm(forms.ModelForm):
    class Meta:
        model = Patient
        fields = []  # No fields needed - patient_id is auto-generated


class ScanPairForm(forms.ModelForm):
    class Meta:
        model = ScanPair
        fields = ['name', 'upper_scan_raw', 'lower_scan_raw', 'visibility']
        widgets = {
            'name': forms.TextInput(attrs={'class': 'form-control', 'placeholder': 'Patient X'}),
            'upper_scan_raw': forms.FileInput(attrs={'class': 'form-control', 'accept': '.stl'}),
            'lower_scan_raw': forms.FileInput(attrs={'class': 'form-control', 'accept': '.stl'}),
            'visibility': forms.Select(attrs={'class': 'form-control'}),
        }
        labels = {
            'name': 'Scan Name',
            'upper_scan_raw': 'Upper Jaw Scan (STL)',
            'lower_scan_raw': 'Lower Jaw Scan (STL)',
            'visibility': 'Visibility',
        }


class ClassificationForm(forms.ModelForm):
    class Meta:
        model = Classification
        fields = ['sagittal_left', 'sagittal_right', 'vertical', 'transverse', 'midline']
        widgets = {
            'sagittal_left': forms.Select(attrs={'class': 'form-control'}),
            'sagittal_right': forms.Select(attrs={'class': 'form-control'}),
            'vertical': forms.Select(attrs={'class': 'form-control'}),
            'transverse': forms.Select(attrs={'class': 'form-control'}),
            'midline': forms.Select(attrs={'class': 'form-control'}),
        }


class ScanManagementForm(forms.ModelForm):
    class Meta:
        model = ScanPair
        fields = ['name', 'visibility', 'dataset']
        widgets = {
            'name': forms.TextInput(attrs={'class': 'form-control form-control-sm', 'placeholder': 'Scan name'}),
            'visibility': forms.Select(attrs={'class': 'form-select form-select-sm'}),
            'dataset': forms.Select(attrs={'class': 'form-select form-select-sm'}),
        }
        labels = {
            'name': 'Name',
            'visibility': 'Visibility',
            'dataset': 'Dataset',
        }
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields['dataset'].empty_label = "No Dataset"
        self.fields['dataset'].required = False


class DatasetForm(forms.ModelForm):
    class Meta:
        model = Dataset
        fields = ['name', 'description']
        widgets = {
            'name': forms.TextInput(attrs={'class': 'form-control form-control-sm', 'placeholder': 'Dataset name'}),
            'description': forms.Textarea(attrs={'class': 'form-control form-control-sm', 'rows': 2, 'placeholder': 'Optional description'}),
        } 