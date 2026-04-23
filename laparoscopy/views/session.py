from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.shortcuts import redirect

from common.models import Project, ProjectAccess
from laparoscopy.views._helpers import _get_profile


@login_required
def set_laparoscopy(request):
    proj = (
        Project.objects.filter(slug="laparoscopy").first()
        or Project.objects.filter(name__iexact="laparoscopy").first()
    )
    if not proj:
        proj = Project.objects.create(name="laparoscopy", slug="laparoscopy")

    profile = _get_profile(request)
    if not profile or not (profile.is_admin() or profile.is_student_developer()):
        has_access = ProjectAccess.objects.filter(
            user=request.user,
            project=proj,
        ).exists()
        if not has_access:
            messages.error(request, "You don't have access to the laparoscopy project.")
            return redirect("home")

    request.session["current_project_id"] = proj.id
    return redirect("laparoscopy:patient_list")
