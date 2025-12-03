from django.db import models
from django.contrib.auth.models import User

class BrainUserProfile(models.Model):
    ROLE_CHOICES = [
        ('standard', 'Standard User'),
        ('annotator', 'Annotator'),
        ('project_manager', 'Project Manager'),
        ('admin', 'Administrator'),
        ('student_dev', 'Student Developer'),
    ]

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='brain_profile')
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='standard')

    class Meta:
        verbose_name = "User profile"   
        verbose_name_plural = "User profiles" 

    def __str__(self):
        return f"{self.user.username} - {self.get_role_display()}"
    
    def is_annotator(self):
        return self.role in ['annotator', 'project_manager', 'admin']
    
    def is_project_manager(self):
        return self.role == 'project_manager'
    
    def is_admin(self):
        return self.role == 'admin'
    
    def is_student_developer(self):
        return self.role == 'student_dev'
    
    def can_upload_scans(self):
        """Check if user can upload scans"""
        return self.role in ['annotator', 'project_manager', 'admin', 'student_dev']
    
    def can_see_debug_scans(self):
        """Check if user can see debug scans"""
        return self.role in ['admin', 'student_dev']
    
    def can_see_public_private_scans(self):
        """Check if user can see public/private scans"""
        return self.role in ['annotator', 'project_manager', 'admin', 'standard']
    
    def can_modify_scan_settings(self):
        """Check if user can modify scan settings (visibility, dataset, etc.)"""
        return self.role in ['annotator', 'project_manager', 'admin']
    
    def can_delete_scans(self):
        """Check if user can delete scans"""
        return self.role in ['admin']  # Only admins can delete non-debug scans
    
    def can_delete_debug_scans(self):
        """Check if user can delete debug scans"""
        return self.role in ['admin', 'student_dev']
    
    def can_view_other_profiles(self):
        """Check if user can view other users' profiles"""
        return self.role in ['project_manager', 'admin']


    def __str__(self):
        return f"Brain profile of {self.user.username}"
