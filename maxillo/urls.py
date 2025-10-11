from django.urls import path, include
from django.shortcuts import redirect
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from maxillo.models import Project, ProjectAccess


@login_required
def set_maxillo(request):
	proj, _ = Project.objects.get_or_create(name='Maxillo')
	
	# Check if user has access to Maxillo project
	if not (request.user.profile.is_admin or request.user.profile.is_student_developer):
		has_access = ProjectAccess.objects.filter(
			user=request.user,
			project=proj,
			can_view=True
		).exists()
		if not has_access:
			messages.error(request, "You don't have access to the Maxillo project.")
			return redirect('home')
	
	request.session['current_project_id'] = proj.id
	return redirect('maxillo:patient_list')


urlpatterns = [
	path('', set_maxillo, name='maxillo_home'),
	path('', include(('maxillo.app_urls', 'maxillo'), namespace='maxillo')),
]
