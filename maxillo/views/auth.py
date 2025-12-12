"""Authentication and invitation-related views."""
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required, user_passes_test
from django.contrib import messages
from django.utils import timezone
from django.urls import reverse
import uuid

from ..models import Invitation
from ..forms import InvitationForm, InvitedUserCreationForm
from common.models import ProjectAccess
from brain.models import BrainUserProfile
from maxillo.models import MaxilloUserProfile   


def register(request):
    if request.method == 'POST':
        form = InvitedUserCreationForm(request.POST)
        if form.is_valid():
            invitation = Invitation.objects.get(code=form.cleaned_data['invitation_code'])
            user = form.save()
            project_name = invitation.project.name if invitation.project else None
            if project_name:
                pname = (project_name or '').lower()
                if pname == 'maxillo':
                    profile, created = MaxilloUserProfile.objects.get_or_create(
                        user=user,
                        defaults={'role': invitation.role}
                    )
                    if not created and profile.role != invitation.role:
                        profile.role = invitation.role
                        profile.save()
                elif pname == 'brain':
                    profile, created = BrainUserProfile.objects.get_or_create(
                        user=user,
                        defaults={'role': invitation.role}
                    )
                    if not created and profile.role != invitation.role:
                        profile.role = invitation.role
                        profile.save()
            
            # Create ProjectAccess entry if invitation has a project
            if invitation.project:
                ProjectAccess.objects.create(
                    user=user,
                    project=invitation.project,
                    can_view=True,
                    can_upload=False  # Default: view-only access
                )
            
            invitation.used_at = timezone.now()
            invitation.used_by = user
            invitation.save()
            messages.success(request, f'Account created for {user.username}!')
            return redirect('login')
    else:
        initial = {}
        if 'code' in request.GET:
            initial['invitation_code'] = request.GET['code']
            try:
                invitation = Invitation.objects.get(code=request.GET['code'])
                if invitation.email:
                    initial['email'] = invitation.email
            except Invitation.DoesNotExist:
                pass
        form = InvitedUserCreationForm(initial=initial)
    return render(request, 'registration/register.html', {'form': form})


@login_required
@user_passes_test(lambda u: u.is_staff)
def invitation_list(request):
    invitations = Invitation.objects.all().order_by('-created_at')
    if request.method == 'POST':
        form = InvitationForm(request.POST)
        if form.is_valid():
            invitation = form.save(commit=False)
            invitation.code = str(uuid.uuid4())
            invitation.created_by = request.user
            invitation.save()
            messages.success(request, 'Invitation created successfully!')
            return redirect('invitation_list')
    else:
        form = InvitationForm()
    return render(request, 'registration/invitation_list.html', {
        'invitations': invitations,
        'form': form,
        'registration_base_url': request.build_absolute_uri(reverse('register'))
    })


@login_required
@user_passes_test(lambda u: u.profile.is_admin)
def delete_invitation(request, code):
    invitation = get_object_or_404(Invitation, code=code)
    if not invitation.used_at:  # Only allow deleting unused invitations
        invitation.delete()
        messages.success(request, 'Invitation deleted successfully!')
    return redirect('invitation_list')

