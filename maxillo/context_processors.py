from .models import Project, ProjectAccess


def current_project(request):
	project = None
	icon = ''
	name = ''
	description = ''
	all_projects = []
	pid = request.session.get('current_project_id')
	if pid:
		try:
			project = Project.objects.get(id=pid, is_active=True)
			name = getattr(project, 'name', '') or ''
			icon = getattr(project, 'icon', '') or ''
			description = getattr(project, 'description', '') or ''
		except Project.DoesNotExist:
			pass
	# Expose projects based on user access for navbar switching
	user = getattr(request, 'user', None)
	try:
		if user and user.is_authenticated:
			# Admins and student developers can see all projects
			if user.is_staff or getattr(user.profile, 'is_admin', False) or getattr(user.profile, 'is_student_developer', False):
				all_projects = Project.objects.filter(is_active=True).order_by('name')
			else:
				# Regular users only see projects they have access to
				accessible_project_ids = ProjectAccess.objects.filter(
					user=user,
					can_view=True
				).values_list('project_id', flat=True)
				all_projects = Project.objects.filter(
					is_active=True,
					id__in=accessible_project_ids
				).order_by('name')
	except Exception:
		# Avoid breaking templates if profile or db access fails in edge cases
		all_projects = []
	return {
		'current_project': project,
		'current_project_name': name,
		'current_project_icon': icon,
		'current_project_description': description,
		'current_project_id': pid,
		'all_projects': all_projects,
	}


