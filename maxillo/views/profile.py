"""User profile views."""
from django.shortcuts import render, get_object_or_404, redirect
from django.contrib.auth.decorators import login_required
from django.contrib.auth.models import User
from django.contrib import messages
from django.db.models import Count, Q, Max
from django.utils import timezone
from datetime import timedelta

from ..models import Patient, Classification, VoiceCaption
from .helpers import render_with_fallback

import logging
logger = logging.getLogger(__name__)


@login_required
def user_profile(request, username=None):
    """
    Display user profile with statistics and activity.
    
    Regular users can only view their own profile.
    Admins can view any user's profile.
    """
    # If no username provided, show current user's profile
    if username is None:
        target_user = request.user
    else:
        # Check if current user can view other profiles (admin or project manager)
        if not request.user.profile.can_view_other_profiles():
            messages.error(request, 'You do not have permission to view other user profiles.')
            return redirect('maxillo:user_profile')
        
        # Get the target user
        target_user = get_object_or_404(User, username=username)
    
    # Statistics
    # 1. Patients uploaded
    patients_uploaded = Patient.objects.filter(uploaded_by=target_user).order_by('-uploaded_at')
    total_patients_uploaded = patients_uploaded.count()
    
    # 2. Bite classifications (manual annotations)
    classifications = Classification.objects.filter(
        annotator=target_user,
        classifier='manual'
    ).select_related('patient').order_by('-timestamp')
    total_classifications = classifications.count()
    
    # Get unique patients annotated (a patient might have been annotated multiple times)
    unique_patients_annotated = classifications.values('patient').distinct().count()
    
    # 3. Voice captions
    voice_captions = VoiceCaption.objects.filter(
        user=target_user
    ).select_related('patient').order_by('-created_at')
    total_voice_captions = voice_captions.count()
    
    # Last activity timestamp
    last_activity = None
    last_activity_type = None
    
    # Check most recent activity across all types
    activities = []
    
    if patients_uploaded.exists():
        last_upload = patients_uploaded.first()
        activities.append(('upload', last_upload.uploaded_at))
    
    if classifications.exists():
        last_classification = classifications.first()
        activities.append(('classification', last_classification.timestamp))
    
    if voice_captions.exists():
        last_caption = voice_captions.first()
        activities.append(('voice_caption', last_caption.created_at))
    
    if activities:
        last_activity_type, last_activity = max(activities, key=lambda x: x[1])
    
    # Recent activity lists (last 20 of each)
    recent_uploads = patients_uploaded[:20]
    recent_classifications = classifications[:20]
    recent_voice_captions = voice_captions[:20]
    
    # Calculate activity in last 7 days
    seven_days_ago = timezone.now() - timedelta(days=7)
    
    uploads_last_7_days = Patient.objects.filter(
        uploaded_by=target_user,
        uploaded_at__gte=seven_days_ago
    ).count()
    
    classifications_last_7_days = Classification.objects.filter(
        annotator=target_user,
        classifier='manual',
        timestamp__gte=seven_days_ago
    ).count()
    
    voice_captions_last_7_days = VoiceCaption.objects.filter(
        user=target_user,
        created_at__gte=seven_days_ago
    ).count()
    
    context = {
        'target_user': target_user,
        'is_own_profile': target_user == request.user,
        'is_viewing_other_profile': request.user.profile.can_view_other_profiles() and target_user != request.user,
        
        # Statistics
        'total_patients_uploaded': total_patients_uploaded,
        'total_classifications': total_classifications,
        'unique_patients_annotated': unique_patients_annotated,
        'total_voice_captions': total_voice_captions,
        
        # Last activity
        'last_activity': last_activity,
        'last_activity_type': last_activity_type,
        
        # Recent activity
        'recent_uploads': recent_uploads,
        'recent_classifications': recent_classifications,
        'recent_voice_captions': recent_voice_captions,
        
        # Last 7 days stats
        'uploads_last_7_days': uploads_last_7_days,
        'classifications_last_7_days': classifications_last_7_days,
        'voice_captions_last_7_days': voice_captions_last_7_days,
    }
    
    # Add all users list for dropdown (only on own profile for admins/project managers)
    if request.user.profile.can_view_other_profiles() and target_user == request.user:
        all_users = User.objects.select_related('profile').order_by('username')
        context['all_users'] = all_users
    
    return render_with_fallback(request, 'user_profile', context)

