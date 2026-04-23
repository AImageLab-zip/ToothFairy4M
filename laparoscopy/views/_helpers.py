import json
import math
import os
import re

from django.apps import apps


def _get_profile(request):
    """Return the active ProjectAccess for the request user, or None."""
    return getattr(request.user, "profile", None)


def _parse_json_body(request):
    if not request.body:
        return {}
    try:
        return json.loads(request.body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise ValueError("Invalid JSON body")


def _worker_url(request, path, specific_env):
    specific = (os.getenv(specific_env) or "").strip()
    if specific:
        return specific
    base = (os.getenv("WORKER_BASE_URL") or "").strip()
    if not base:
        host = (request.get_host() or "localhost").split(":", 1)[0]
        scheme = "https" if request.is_secure() else "http"
        base = f"{scheme}://{host}"
    base = base.rstrip("/")
    return f"{base}{path}"


def _is_hex_color(value):
    return (
        isinstance(value, str) and re.fullmatch(r"#[0-9a-fA-F]{6}", value) is not None
    )


def _next_type_order(model_cls, project):
    last_order = (
        model_cls.objects.filter(project=project)
        .order_by("-order")
        .values_list("order", flat=True)
        .first()
    )
    if last_order is None:
        return 0
    return last_order + 1


def _patient_model():
    return apps.get_model("maxillo", "Patient")


def _patient_permissions(profile, patient):
    if not profile:
        return False, False

    can_view = False
    if profile.is_admin():
        can_view = True
    elif profile.is_annotator() and patient.visibility != "debug":
        can_view = True
    elif profile.is_student_developer() and patient.visibility == "debug":
        can_view = True
    elif patient.visibility == "public":
        can_view = True

    # Collaborative annotations: any user who can view can also modify.
    can_modify = can_view
    return can_view, can_modify


def _normalize_float(value, field_name):
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        raise ValueError(f"{field_name} must be numeric")
    if not math.isfinite(parsed):
        raise ValueError(f"{field_name} must be finite")
    return parsed
