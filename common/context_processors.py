from common.models import Project, ProjectAccess


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
            # Use getattr checks to avoid attribute errors if profile is missing
            if user.is_staff or getattr(getattr(user, 'profile', None), 'is_admin', False) or getattr(getattr(user, 'profile', None), 'is_student_developer', False):
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

    # Determine project-specific role display for the current user
    current_project_slug = ''
    current_project_role_display = None
    current_project_profile = None
    if project and user and user.is_authenticated:
        current_project_slug = getattr(project, 'slug', '') or ''
        # Try convention: <slug>_profile, then fallback to 'profile'
        try:
            if current_project_slug:
                attr_name = f"{current_project_slug}_profile"
                if hasattr(user, attr_name):
                    current_project_profile = getattr(user, attr_name)
                    current_project_role_display = getattr(current_project_profile, 'get_role_display', None)
                    if callable(current_project_role_display):
                        current_project_role_display = current_project_role_display()
            # fallback
            if not current_project_role_display and hasattr(user, 'profile'):
                current_project_profile = user.profile
                current_project_role_display = getattr(current_project_profile, 'get_role_display', None)
                if callable(current_project_role_display):
                    current_project_role_display = current_project_role_display()
        except Exception:
            # Ignore profile lookup errors
            current_project_role_display = None

    return {
        'current_project': project,
        'current_project_name': name,
        'current_project_icon': icon,
        'current_project_description': description,
        'current_project_id': pid,
        'all_projects': all_projects,
        'current_project_slug': current_project_slug,
        'current_project_role_display': current_project_role_display,
        'current_project_profile': current_project_profile,
    }
