from django import forms
from .models import Patient, ScanPair, Classification, Dataset


class PatientForm(forms.ModelForm):
    class Meta:
        model = Patient
        fields = []  # No fields needed - patient_id is auto-generated


class ScanPairForm(forms.ModelForm):
    class Meta:
        model = ScanPair
        fields = ['name', 'upper_scan_raw', 'lower_scan_raw', 'cbct', 'visibility']
        widgets = {
            'name': forms.TextInput(attrs={'class': 'form-control', 'placeholder': 'Patient X'}),
            'upper_scan_raw': forms.FileInput(attrs={'class': 'form-control', 'accept': '.stl'}),
            'lower_scan_raw': forms.FileInput(attrs={'class': 'form-control', 'accept': '.stl'}),
            'cbct': forms.FileInput(attrs={'class': 'form-control', 'accept': '.nii,.gz'}),
            'visibility': forms.Select(attrs={'class': 'form-control'}),
        }
        labels = {
            'name': 'Scan Name',
            'upper_scan_raw': 'Upper Jaw Scan (STL)',
            'lower_scan_raw': 'Lower Jaw Scan (STL)',
            'cbct': 'CBCT Scan (NII/GZ)',
            'visibility': 'Visibility',
        }
    
    def clean(self):
        cleaned_data = super().clean()
        upper_scan = cleaned_data.get('upper_scan_raw')
        lower_scan = cleaned_data.get('lower_scan_raw')
        cbct = cleaned_data.get('cbct')
        
        # Check if both IOS scans are provided (if any IOS is provided)
        has_any_ios = upper_scan or lower_scan
        has_both_ios = upper_scan and lower_scan
        has_cbct = bool(cbct)
        
        # Validation rules:
        # 1. Cannot have none
        # 2. If uploading IOS, must have both upper and lower
        # 3. Can have CBCT only, IOS only, or both
        
        if not has_cbct and not has_both_ios:
            if has_any_ios:
                # Has one IOS but not both
                raise forms.ValidationError(
                    "Both upper and lower jaw scans are required when uploading intra-oral scans. "
                    "Alternatively, you can upload only a CBCT scan."
                )
            else:
                # Has nothing
                raise forms.ValidationError(
                    "At least one scan type is required. Please upload either both intra-oral scans "
                    "(upper and lower) or a CBCT scan, or both."
                )
        
        return cleaned_data


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