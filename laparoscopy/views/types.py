from django.contrib.auth.decorators import login_required
from django.db import IntegrityError
from django.http import HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404
from django.views.decorators.http import require_http_methods

from laparoscopy.models import (
    QuadrantClassificationMarker,
    QuadrantType,
    QuadrantTypeUserColor,
    RegionType,
    RegionTypeUserColor,
)

from laparoscopy.views._helpers import (
    _get_profile,
    _is_hex_color,
    _next_type_order,
    _parse_json_body,
)


def _types_payload(project, user, TypeModel, ColorModel, type_fk):
    types = list(TypeModel.objects.filter(project=project).order_by("order", "name"))
    user_colors = {
        getattr(pref, type_fk + "_id"): pref.color
        for pref in ColorModel.objects.filter(
            **{type_fk + "__project": project}, user=user
        )
    }
    return [
        {
            "id": t.id,
            "name": t.name,
            "color": user_colors.get(t.id, t.color),
        }
        for t in types
    ]


def _handle_type_list(request, TypeModel, ColorModel, type_fk, default_color):
    profile = _get_profile(request)
    if not profile:
        return JsonResponse({"error": "No active project"}, status=403)

    if request.method == "GET":
        return JsonResponse(
            {
                "types": _types_payload(
                    profile.project, request.user, TypeModel, ColorModel, type_fk
                )
            }
        )

    if not profile.is_admin():
        return JsonResponse({"error": "Administrator access required"}, status=403)

    try:
        data = _parse_json_body(request)
    except ValueError:
        return JsonResponse({"error": "Invalid JSON body"}, status=400)

    name = (data.get("name") or "").strip()
    if not name:
        return JsonResponse({"error": "name is required"}, status=400)

    color = data.get("color", default_color)
    if not _is_hex_color(color):
        return JsonResponse(
            {"error": "color must be a hex value like " + default_color}, status=400
        )

    obj, created = TypeModel.objects.get_or_create(
        project=profile.project,
        name=name,
        defaults={
            "color": color,
            "order": _next_type_order(TypeModel, profile.project),
        },
    )
    if not created and obj.color != color:
        obj.color = color
        obj.save(update_fields=["color"])

    return JsonResponse(
        {"id": obj.id, "name": obj.name, "color": obj.color},
        status=201 if created else 200,
    )


def _handle_type_detail(
    request,
    pk,
    TypeModel,
    ColorModel,
    type_fk,
    conflict_msg,
    before_delete=None,
):
    profile = _get_profile(request)
    if not profile:
        return JsonResponse({"error": "No active project"}, status=403)

    obj = get_object_or_404(TypeModel, pk=pk, project=profile.project)

    if request.method == "PATCH":
        try:
            data = _parse_json_body(request)
        except ValueError:
            return JsonResponse({"error": "Invalid JSON body"}, status=400)

        has_name = "name" in data
        has_color = "color" in data
        if not has_name and not has_color:
            return JsonResponse(
                {"error": "At least one of name or color is required"}, status=400
            )

        if has_name and not profile.is_admin():
            return JsonResponse(
                {"error": "Administrator access required for rename"}, status=403
            )

        if has_name:
            name = (data.get("name") or "").strip()
            if not name:
                return JsonResponse({"error": "name cannot be empty"}, status=400)
            obj.name = name
            try:
                obj.save()
            except IntegrityError:
                return JsonResponse({"error": conflict_msg}, status=400)

        if has_color:
            color = data.get("color")
            if not _is_hex_color(color):
                return JsonResponse(
                    {"error": "color must be a hex value like #3498db"}, status=400
                )
            ColorModel.objects.update_or_create(
                **{type_fk: obj, "user": request.user},
                defaults={"color": color},
            )

        effective_color = (
            ColorModel.objects.filter(**{type_fk: obj}, user=request.user)
            .values_list("color", flat=True)
            .first()
            or obj.color
        )
        return JsonResponse({"id": obj.id, "name": obj.name, "color": effective_color})

    # DELETE
    if not profile.is_admin():
        return JsonResponse({"error": "Administrator access required"}, status=403)

    if before_delete is not None:
        maybe_response = before_delete(request, profile, obj)
        if maybe_response is not None:
            return maybe_response

    obj.delete()
    return HttpResponse(status=204)


def _quadrant_type_delete_hook(request, profile, obj):
    markers_qs = QuadrantClassificationMarker.objects.filter(quadrant_type=obj)
    if not markers_qs.exists():
        return None

    try:
        data = _parse_json_body(request)
    except ValueError:
        return JsonResponse({"error": "Invalid JSON body"}, status=400)

    replacement_id = data.get("replacement_id")
    if replacement_id in [None, ""]:
        return JsonResponse(
            {"error": "replacement_id is required to delete a type in use"},
            status=400,
        )
    try:
        replacement_id = int(replacement_id)
    except (TypeError, ValueError):
        return JsonResponse({"error": "replacement_id must be an integer"}, status=400)

    if replacement_id == obj.id:
        return JsonResponse(
            {"error": "replacement_id must differ from the deleted type"},
            status=400,
        )

    replacement = QuadrantType.objects.filter(
        id=replacement_id,
        project=profile.project,
    ).first()
    if replacement is None:
        return JsonResponse(
            {"error": "replacement_id must belong to the active project"},
            status=400,
        )

    markers_qs.update(quadrant_type=replacement, updated_by=request.user)
    return None


@login_required
@require_http_methods(["GET", "POST"])
def region_types(request):
    return _handle_type_list(
        request, RegionType, RegionTypeUserColor, "region_type", "#3498db"
    )


@login_required
@require_http_methods(["PATCH", "DELETE"])
def region_type_detail(request, pk):
    return _handle_type_detail(
        request,
        pk,
        RegionType,
        RegionTypeUserColor,
        "region_type",
        "A region type with this name already exists",
    )


@login_required
@require_http_methods(["GET", "POST"])
def quadrant_types(request):
    return _handle_type_list(
        request, QuadrantType, QuadrantTypeUserColor, "quadrant_type", "#e74c3c"
    )


@login_required
@require_http_methods(["PATCH", "DELETE"])
def quadrant_type_detail(request, pk):
    return _handle_type_detail(
        request,
        pk,
        QuadrantType,
        QuadrantTypeUserColor,
        "quadrant_type",
        "A quadrant type with this name already exists",
        before_delete=_quadrant_type_delete_hook,
    )
