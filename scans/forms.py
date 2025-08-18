from django import forms
from django.contrib.auth.forms import UserCreationForm
from django.contrib.auth.models import User
from datetime import timedelta
from django.utils import timezone
from .models import (
    Patient, ScanPair, Classification, Dataset, 
    Invitation
)


class PatientForm(forms.ModelForm):
    class Meta:
        model = Patient
        fields = []  # No fields needed - patient_id is auto-generated


class ScanPairForm(forms.ModelForm):
    # Hidden field to track upload type
    cbct_upload_type = forms.CharField(widget=forms.HiddenInput(), required=False)
    
    class Meta:
        model = ScanPair
        fields = ['name', 'upper_scan_raw', 'lower_scan_raw', 'cbct', 'visibility']
        widgets = {
            'name': forms.TextInput(attrs={'class': 'form-control', 'placeholder': 'Patient X'}),
            'upper_scan_raw': forms.FileInput(attrs={'class': 'form-control', 'accept': '.stl'}),
            'lower_scan_raw': forms.FileInput(attrs={'class': 'form-control', 'accept': '.stl'}),
            'cbct': forms.FileInput(attrs={
                'class': 'form-control', 
                'accept': '.dcm,.dicom,.nii,.nii.gz,.gz,.mha,.mhd,.nrrd,.nhdr,.zip,.tar,.tar.gz,.tgz,application/dicom'
            }),
            'visibility': forms.Select(attrs={'class': 'form-control'}),
        }
        labels = {
            'name': 'Scan Name',
            'upper_scan_raw': 'Upper Jaw Scan (STL)',
            'lower_scan_raw': 'Lower Jaw Scan (STL)',
            'cbct': 'CBCT Scan (DICOM/NIfTI/MetaImage/NRRD)',
            'visibility': 'Visibility',
        }
    
    def __init__(self, *args, user=None, **kwargs):
        super().__init__(*args, **kwargs)
        
        # Customize visibility choices based on user role
        if user and hasattr(user, 'profile'):
            if user.profile.is_student_developer():
                # Student developers can only create debug scans
                self.fields['visibility'].choices = [('debug', 'Debug')]
                self.fields['visibility'].initial = 'debug'
                self.fields['visibility'].widget.attrs['readonly'] = True
            elif user.profile.is_admin():
                # Admins can create all types of scans
                self.fields['visibility'].choices = ScanPair.VISIBILITY_CHOICES
            else:
                # Annotators can create public and private scans (not debug)
                self.fields['visibility'].choices = [
                    ('public', 'Public'),
                    ('private', 'Private'),
                ]
    
    def clean(self):
        cleaned_data = super().clean()
        upper_scan = cleaned_data.get('upper_scan_raw')
        lower_scan = cleaned_data.get('lower_scan_raw')
        cbct = cleaned_data.get('cbct')
        cbct_upload_type = cleaned_data.get('cbct_upload_type')
        
        # Check if both IOS scans are provided (if any IOS is provided)
        has_any_ios = upper_scan or lower_scan
        has_both_ios = upper_scan and lower_scan
        
        # Check for CBCT upload (file or folder)
        has_cbct = bool(cbct) or cbct_upload_type == 'folder'
        
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
    
    def __init__(self, *args, user=None, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields['dataset'].empty_label = "No Dataset"
        self.fields['dataset'].required = False
        
        # Customize visibility choices based on user role
        if user and hasattr(user, 'profile'):
            if user.profile.is_student_developer():
                # Student developers can only manage debug scans
                self.fields['visibility'].choices = [('debug', 'Debug')]
            elif user.profile.is_admin():
                # Admins can manage all types of scans
                self.fields['visibility'].choices = ScanPair.VISIBILITY_CHOICES
            else:
                # Annotators can manage public and private scans (not debug)
                self.fields['visibility'].choices = [
                    ('public', 'Public'),
                    ('private', 'Private'),
                ]
    
    def clean(self):
        # Override the clean method to skip file validation for management updates
        # We only want to validate the management fields, not the scan files
        cleaned_data = super().clean()
        
        # Only validate the fields we care about for management
        name = cleaned_data.get('name')
        visibility = cleaned_data.get('visibility')
        dataset = cleaned_data.get('dataset')
        
        # Basic validation for management fields
        if name and len(name.strip()) == 0:
            raise forms.ValidationError("Scan name cannot be empty.")
        
        return cleaned_data


class DatasetForm(forms.ModelForm):
    class Meta:
        model = Dataset
        fields = ['name', 'description']
        widgets = {
            'name': forms.TextInput(attrs={'class': 'form-control form-control-sm', 'placeholder': 'Dataset name'}),
            'description': forms.Textarea(attrs={'class': 'form-control form-control-sm', 'rows': 2, 'placeholder': 'Optional description'}),
        }


class InvitationForm(forms.ModelForm):
    email = forms.EmailField(required=False, 
                           widget=forms.EmailInput(attrs={'class': 'form-control'}),
                           help_text="Optional: Restrict invitation to specific email")
    expiry_days = forms.IntegerField(min_value=1, max_value=30, initial=7,
                                   widget=forms.NumberInput(attrs={'class': 'form-control'}),
                                   help_text="Number of days before invitation expires")
    
    class Meta:
        model = Invitation
        fields = ['email', 'role', 'expiry_days']
        widgets = {
            'role': forms.Select(attrs={'class': 'form-control'}),
        }
    
    def save(self, commit=True):
        instance = super().save(False)
        instance.expires_at = timezone.now() + timedelta(days=self.cleaned_data['expiry_days'])
        if commit:
            instance.save()
        return instance


class InvitedUserCreationForm(UserCreationForm):
    invitation_code = forms.CharField(max_length=64)
    email = forms.EmailField(required=True)
    
    class Meta:
        model = User
        fields = ['username', 'email', 'password1', 'password2', 'invitation_code']
    
    def clean_invitation_code(self):
        code = self.cleaned_data.get('invitation_code')
        try:
            invitation = Invitation.objects.get(code=code)
            if not invitation.is_valid():
                raise forms.ValidationError("This invitation has expired or has already been used.")
            if invitation.email and invitation.email != self.cleaned_data.get('email'):
                raise forms.ValidationError("This invitation was created for a different email address.")
            return code
        except Invitation.DoesNotExist:
            raise forms.ValidationError("Invalid invitation code.") 