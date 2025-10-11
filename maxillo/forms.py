from django import forms
from django.contrib.auth.forms import UserCreationForm
from django.contrib.auth.models import User
from datetime import timedelta
from django.utils import timezone
from .models import (
    Patient, Classification, Dataset
)
from common.models import Invitation
from .models import Tag, Folder


class PatientForm(forms.ModelForm):
    class Meta:
        model = Patient
        fields = []  # No fields needed - patient_id is auto-generated


class PatientUploadForm(forms.ModelForm):
    """
    Simple patient upload form with hardcoded modality fields:
    - CBCT (single file or folder)
    - IOS (upper + lower STL files)
    - Teleradiography (single image)
    - Intraoral photos (multiple images - NOT in form, handled in view)
    - Panoramic (single image)
    """
    # CBCT fields
    cbct = forms.FileField(
        required=False,
        label='CBCT File',
        widget=forms.FileInput(attrs={
            'class': 'form-control',
            'accept': '.dcm,.dicom,.nii,.nii.gz,.gz,.mha,.mhd,.nrrd,.nhdr,.zip,.tar,.tar.gz,.tgz'
        })
    )
    cbct_upload_type = forms.CharField(widget=forms.HiddenInput(), required=False)
    
    # IOS fields (upper + lower)
    ios_upper = forms.FileField(
        required=False,
        label='IOS - Upper',
        widget=forms.FileInput(attrs={
            'class': 'form-control',
            'accept': '.stl'
        })
    )
    ios_lower = forms.FileField(
        required=False,
        label='IOS - Lower',
        widget=forms.FileInput(attrs={
            'class': 'form-control',
            'accept': '.stl'
        })
    )
    
    # Teleradiography
    teleradiography = forms.FileField(
        required=False,
        label='Teleradiography',
        widget=forms.FileInput(attrs={
            'class': 'form-control',
            'accept': '.jpg,.jpeg,.png'
        })
    )
    
    # Panoramic
    panoramic = forms.FileField(
        required=False,
        label='Panoramic',
        widget=forms.FileInput(attrs={
            'class': 'form-control',
            'accept': '.jpg,.jpeg,.png'
        })
    )
    
    # Note: intraoral-photo is multiple files, handled in view with request.FILES.getlist('intraoral-photos')
    
    # Organization fields
    folder = forms.ModelChoiceField(
        queryset=Folder.objects.all().order_by('name'), 
        required=False, 
        widget=forms.Select(attrs={'class': 'form-control'})
    )
    tags_text = forms.CharField(
        required=False, 
        help_text='Comma-separated tags', 
        widget=forms.TextInput(attrs={'class': 'form-control', 'placeholder': 'e.g. caseA, urgent'})
    )
    
    class Meta:
        model = Patient
        fields = ['name', 'visibility', 'folder']
        widgets = {
            'name': forms.TextInput(attrs={'class': 'form-control', 'placeholder': 'Patient X'}),
            'visibility': forms.Select(attrs={'class': 'form-control'}),
        }
        labels = {
            'name': 'Scan Name',
            'visibility': 'Visibility',
            'folder': 'Folder',
        }
    
    def __init__(self, *args, user=None, **kwargs):
        super().__init__(*args, **kwargs)
        
        # Customize visibility choices based on user role
        if user and hasattr(user, 'profile'):
            if user.profile.is_student_developer():
                self.fields['visibility'].choices = [('debug', 'Debug')]
                self.fields['visibility'].initial = 'debug'
                self.fields['visibility'].widget.attrs['readonly'] = True
            elif user.profile.is_admin():
                self.fields['visibility'].choices = Patient.VISIBILITY_CHOICES
            else:
                self.fields['visibility'].choices = [
                    ('public', 'Public'),
                    ('private', 'Private'),
                ]
    
    def clean(self):
        cleaned_data = super().clean()
        
        # IOS validation: if one is provided, both must be provided
        ios_upper = cleaned_data.get('ios_upper')
        ios_lower = cleaned_data.get('ios_lower')
        
        if (ios_upper and not ios_lower) or (ios_lower and not ios_upper):
            raise forms.ValidationError(
                "Both upper and lower IOS scans must be provided together."
            )
        
        return cleaned_data
   
    def save(self, commit=True):
        instance = super().save(commit)
        
        # Parse tags and assign
        tags_text = self.cleaned_data.get('tags_text', '') or ''
        tag_names = [t.strip() for t in tags_text.split(',') if t.strip()]
        if commit:
            if tag_names:
                tags = []
                for name in tag_names:
                    tag, _ = Tag.objects.get_or_create(name=name)
                    tags.append(tag)
                instance.tags.set(tags + list(instance.tags.all()))
        
        return instance


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


class PatientManagementForm(forms.ModelForm):
    folder = forms.ModelChoiceField(queryset=Folder.objects.all().order_by('name'), required=False, widget=forms.Select(attrs={'class': 'form-select form-select-sm'}))
    tags_text = forms.CharField(required=False, help_text='Comma-separated tags', widget=forms.TextInput(attrs={'class': 'form-control form-control-sm', 'placeholder': 'e.g. caseA, urgent'}))
    class Meta:
        model = Patient
        fields = ['name', 'visibility', 'dataset', 'folder']
        widgets = {
            'name': forms.TextInput(attrs={'class': 'form-control form-control-sm', 'placeholder': 'Scan name'}),
            'visibility': forms.Select(attrs={'class': 'form-select form-select-sm'}),
            'dataset': forms.Select(attrs={'class': 'form-select form-select-sm'}),
        }
        labels = {
            'name': 'Name',
            'visibility': 'Visibility',
            'dataset': 'Dataset',
            'folder': 'Folder',
        }
    
    def __init__(self, *args, user=None, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields['dataset'].empty_label = "No Dataset"
        self.fields['dataset'].required = False
        # Pre-fill tags_text from existing tags
        if self.instance and self.instance.pk:
            self.fields['tags_text'].initial = ', '.join(self.instance.tag_names())
        
        # Customize visibility choices based on user role
        if user and hasattr(user, 'profile'):
            if user.profile.is_student_developer():
                # Student developers can only manage debug scans
                self.fields['visibility'].choices = [('debug', 'Debug')]
            elif user.profile.is_admin():
                # Admins can manage all types of scans
                self.fields['visibility'].choices = Patient.VISIBILITY_CHOICES
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
            raise forms.ValidationError("Patient name cannot be empty.")
        
        return cleaned_data
   
    def save(self, commit=True):
        instance = super().save(commit)
        # Update tags from text
        tags_text = self.cleaned_data.get('tags_text', '') or ''
        tag_names = [t.strip() for t in tags_text.split(',') if t.strip()]
        if commit:
            tags = []
            for name in tag_names:
                tag, _ = Tag.objects.get_or_create(name=name)
                tags.append(tag)
            instance.tags.set(tags)
        return instance


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