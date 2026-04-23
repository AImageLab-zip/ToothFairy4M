from django.contrib.auth.decorators import login_required
from django.db import transaction
from django.http import HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404
from django.views.decorators.http import require_http_methods

from laparoscopy.models import (
    QuadrantClassificationMarker,
    RegionAnnotation,
    QuadrantType,
    RegionType,
)

from laparoscopy.views._helpers import (
    _get_profile,
    _parse_json_body,
    _patient_model,
    _patient_permissions,
    _normalize_float,
)


def _normalize_points(points):
    if not isinstance(points, list):
        raise ValueError("points must be a list")
    if len(points) < 4:
        raise ValueError("points must include at least two vertices")
    if len(points) % 2 != 0:
        raise ValueError("points length must be even")

    normalized = []
    for value in points:
        if isinstance(value, bool):
            raise ValueError("points must contain numeric values")
        normalized.append(_normalize_float(value, "points"))
    return normalized


def _annotation_payload(annotation):
    return {
        "id": annotation.id,
        "patient_id": annotation.patient_id,
        "region_type_id": annotation.region_type_id,
        "region_type_name": annotation.region_type.name,
        "tool": annotation.tool,
        "frame_time": annotation.frame_time,
        "points": annotation.points,
        "stroke_width": annotation.stroke_width,
        "created_by_id": annotation.created_by_id,
        "created_by_username": (
            annotation.created_by.username if annotation.created_by_id else None
        ),
        "updated_by_id": annotation.updated_by_id,
        "updated_by_username": (
            annotation.updated_by.username if annotation.updated_by_id else None
        ),
        "created_at": annotation.created_at.isoformat()
        if annotation.created_at
        else None,
        "updated_at": annotation.updated_at.isoformat()
        if annotation.updated_at
        else None,
    }


def _quadrant_marker_payload(marker):
    return {
        "id": marker.id,
        "patient_id": marker.patient_id,
        "quadrant_type_id": marker.quadrant_type_id,
        "time_ms": marker.time_ms,
    }


def _normalize_time_ms(value):
    if isinstance(value, bool):
        raise ValueError("time_ms must be numeric")
    try:
        parsed = int(round(float(value)))
    except (TypeError, ValueError):
        raise ValueError("time_ms must be numeric")
    if parsed < 0:
        raise ValueError("time_ms must be >= 0")
    return parsed


def _normalize_quadrant_marker_items(raw_markers, project):
    if not isinstance(raw_markers, list):
        raise ValueError("markers must be a list")

    parsed_items = []
    quadrant_type_ids = set()

    for index, raw in enumerate(raw_markers):
        if not isinstance(raw, dict):
            raise ValueError("each marker must be an object")

        raw_marker_id = raw.get("id")
        marker_id = None
        if raw_marker_id not in [None, ""]:
            try:
                marker_id = int(raw_marker_id)
            except (TypeError, ValueError):
                raise ValueError("marker id must be an integer")
            if marker_id <= 0:
                raise ValueError("marker id must be > 0")

        raw_quadrant_type_id = raw.get("quadrant_type_id")
        if raw_quadrant_type_id in [None, ""]:
            raise ValueError("quadrant_type_id is required")
        try:
            quadrant_type_id = int(raw_quadrant_type_id)
        except (TypeError, ValueError):
            raise ValueError("quadrant_type_id must be an integer")

        time_ms = _normalize_time_ms(raw.get("time_ms"))

        parsed = {
            "order": index,
            "id": marker_id,
            "quadrant_type_id": quadrant_type_id,
            "time_ms": time_ms,
        }
        parsed_items.append(parsed)
        quadrant_type_ids.add(quadrant_type_id)

    quadrant_types = {
        obj.id: obj
        for obj in QuadrantType.objects.filter(
            project=project, id__in=quadrant_type_ids
        )
    }
    if len(quadrant_types) != len(quadrant_type_ids):
        raise ValueError("quadrant_type_id must belong to the active project")

    for item in parsed_items:
        item["quadrant_type"] = quadrant_types[item["quadrant_type_id"]]

    sorted_items = sorted(
        parsed_items, key=lambda item: (item["time_ms"], item["order"])
    )

    dedup_same_time = []
    for item in sorted_items:
        if dedup_same_time and dedup_same_time[-1]["time_ms"] == item["time_ms"]:
            dedup_same_time[-1] = item
        else:
            dedup_same_time.append(item)

    compacted = []
    for item in dedup_same_time:
        if compacted and compacted[-1]["quadrant_type_id"] == item["quadrant_type_id"]:
            continue
        compacted.append(item)

    return compacted


def _replace_patient_quadrant_markers(patient, user, marker_items):
    with transaction.atomic():
        keep_ids = []

        for item in marker_items:
            marker, created = QuadrantClassificationMarker.objects.update_or_create(
                patient=patient,
                time_ms=item["time_ms"],
                defaults={
                    "quadrant_type": item["quadrant_type"],
                    "updated_by": user,
                },
            )
            if created:
                marker.created_by = user
                marker.save(update_fields=["created_by"])
            keep_ids.append(marker.id)

        stale_qs = QuadrantClassificationMarker.objects.filter(patient=patient)
        if keep_ids:
            stale_qs.exclude(id__in=keep_ids).delete()
        else:
            stale_qs.delete()

    return list(
        QuadrantClassificationMarker.objects.filter(patient=patient)
        .select_related("quadrant_type")
        .order_by("time_ms", "id")
    )


@login_required
@require_http_methods(["GET", "POST"])
def patient_region_annotations(request, patient_id):
    profile = _get_profile(request)
    if not profile:
        return JsonResponse({"error": "No active project"}, status=403)

    Patient = _patient_model()
    patient = get_object_or_404(Patient, patient_id=patient_id)
    can_view, can_modify = _patient_permissions(profile, patient)
    if not can_view:
        return JsonResponse({"error": "Permission denied"}, status=403)

    if request.method == "GET":
        annotations = (
            RegionAnnotation.objects.filter(patient=patient)
            .select_related("region_type", "created_by", "updated_by")
            .order_by("created_at")
        )
        return JsonResponse(
            {
                "annotations": [
                    _annotation_payload(annotation) for annotation in annotations
                ]
            }
        )

    if not can_modify:
        return JsonResponse({"error": "Permission denied"}, status=403)

    try:
        data = _parse_json_body(request)
    except ValueError:
        return JsonResponse({"error": "Invalid JSON body"}, status=400)

    region_type_id = data.get("region_type_id")
    if region_type_id in [None, ""]:
        return JsonResponse({"error": "region_type_id is required"}, status=400)
    try:
        region_type_id = int(region_type_id)
    except (TypeError, ValueError):
        return JsonResponse({"error": "region_type_id must be an integer"}, status=400)

    tool = str(data.get("tool") or "").strip().lower()
    allowed_tools = {value for value, _ in RegionAnnotation.TOOL_CHOICES}
    if tool not in allowed_tools:
        return JsonResponse(
            {"error": "tool must be one of brush, eraser, polygon"}, status=400
        )

    try:
        frame_time = _normalize_float(data.get("frame_time", 0.0), "frame_time")
    except ValueError as exc:
        return JsonResponse({"error": str(exc)}, status=400)
    if frame_time < 0:
        return JsonResponse({"error": "frame_time must be >= 0"}, status=400)

    try:
        points = _normalize_points(data.get("points"))
    except ValueError as exc:
        return JsonResponse({"error": str(exc)}, status=400)

    if tool == "polygon" and len(points) < 6:
        return JsonResponse(
            {"error": "polygon requires at least three vertices"}, status=400
        )

    try:
        stroke_width = _normalize_float(data.get("stroke_width", 1.0), "stroke_width")
    except ValueError as exc:
        return JsonResponse({"error": str(exc)}, status=400)
    if stroke_width <= 0:
        return JsonResponse({"error": "stroke_width must be > 0"}, status=400)

    region_type = get_object_or_404(
        RegionType,
        id=region_type_id,
        project=profile.project,
    )

    annotation = RegionAnnotation.objects.create(
        patient=patient,
        region_type=region_type,
        tool=tool,
        frame_time=frame_time,
        points=points,
        stroke_width=stroke_width,
        created_by=request.user,
        updated_by=request.user,
    )

    annotation = RegionAnnotation.objects.select_related(
        "region_type", "created_by", "updated_by"
    ).get(id=annotation.id)
    return JsonResponse(_annotation_payload(annotation), status=201)


@login_required
@require_http_methods(["PATCH", "DELETE"])
def region_annotation_detail(request, annotation_id):
    profile = _get_profile(request)
    if not profile:
        return JsonResponse({"error": "No active project"}, status=403)

    annotation = get_object_or_404(
        RegionAnnotation.objects.select_related(
            "patient", "region_type", "created_by", "updated_by"
        ),
        id=annotation_id,
    )
    patient = annotation.patient
    can_view, can_modify = _patient_permissions(profile, patient)
    if not can_view:
        return JsonResponse({"error": "Permission denied"}, status=403)

    if request.method == "DELETE":
        if not can_modify:
            return JsonResponse({"error": "Permission denied"}, status=403)
        annotation.delete()
        return HttpResponse(status=204)

    if not can_modify:
        return JsonResponse({"error": "Permission denied"}, status=403)

    try:
        data = _parse_json_body(request)
    except ValueError:
        return JsonResponse({"error": "Invalid JSON body"}, status=400)

    has_region = "region_type_id" in data
    has_points = "points" in data
    has_frame_time = "frame_time" in data
    has_stroke_width = "stroke_width" in data

    if not (has_region or has_points or has_frame_time or has_stroke_width):
        return JsonResponse(
            {
                "error": "At least one of region_type_id, points, frame_time, stroke_width is required"
            },
            status=400,
        )

    changes = {}

    if has_region:
        try:
            region_type_id = int(data.get("region_type_id"))
        except (TypeError, ValueError):
            return JsonResponse(
                {"error": "region_type_id must be an integer"}, status=400
            )

        region_type = get_object_or_404(
            RegionType,
            id=region_type_id,
            project=profile.project,
        )
        if region_type.id != annotation.region_type_id:
            annotation.region_type = region_type
            changes["region_type_id"] = region_type.id

    if has_points:
        try:
            points = _normalize_points(data.get("points"))
        except ValueError as exc:
            return JsonResponse({"error": str(exc)}, status=400)

        if annotation.tool == "polygon" and len(points) < 6:
            return JsonResponse(
                {"error": "polygon requires at least three vertices"}, status=400
            )
        annotation.points = points
        changes["points"] = points

    if has_frame_time:
        try:
            frame_time = _normalize_float(data.get("frame_time"), "frame_time")
        except ValueError as exc:
            return JsonResponse({"error": str(exc)}, status=400)
        if frame_time < 0:
            return JsonResponse({"error": "frame_time must be >= 0"}, status=400)
        annotation.frame_time = frame_time
        changes["frame_time"] = frame_time

    if has_stroke_width:
        try:
            stroke_width = _normalize_float(data.get("stroke_width"), "stroke_width")
        except ValueError as exc:
            return JsonResponse({"error": str(exc)}, status=400)
        if stroke_width <= 0:
            return JsonResponse({"error": "stroke_width must be > 0"}, status=400)
        annotation.stroke_width = stroke_width
        changes["stroke_width"] = stroke_width

    if not changes:
        return JsonResponse(_annotation_payload(annotation))

    annotation.updated_by = request.user
    annotation.save()
    annotation.refresh_from_db()

    return JsonResponse(_annotation_payload(annotation))


@login_required
@require_http_methods(["GET", "PUT"])
def patient_quadrant_markers(request, patient_id):
    profile = _get_profile(request)
    if not profile:
        return JsonResponse({"error": "No active project"}, status=403)

    Patient = _patient_model()
    patient = get_object_or_404(Patient, patient_id=patient_id)
    can_view, can_modify = _patient_permissions(profile, patient)
    if not can_view:
        return JsonResponse({"error": "Permission denied"}, status=403)

    if request.method == "GET":
        markers = (
            QuadrantClassificationMarker.objects.filter(patient=patient)
            .select_related("quadrant_type")
            .order_by("time_ms", "id")
        )
        return JsonResponse(
            {"markers": [_quadrant_marker_payload(marker) for marker in markers]}
        )

    if not can_modify:
        return JsonResponse({"error": "Permission denied"}, status=403)

    try:
        data = _parse_json_body(request)
    except ValueError:
        return JsonResponse({"error": "Invalid JSON body"}, status=400)

    try:
        normalized_items = _normalize_quadrant_marker_items(
            data.get("markers"),
            profile.project,
        )
    except ValueError as exc:
        return JsonResponse({"error": str(exc)}, status=400)

    markers = _replace_patient_quadrant_markers(
        patient=patient,
        user=request.user,
        marker_items=normalized_items,
    )
    return JsonResponse(
        {"markers": [_quadrant_marker_payload(marker) for marker in markers]}
    )
