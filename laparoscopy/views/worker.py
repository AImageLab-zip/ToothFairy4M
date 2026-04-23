import json
import logging
import base64
from urllib import request as urllib_request
from urllib import error as urllib_error

from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from laparoscopy.views._helpers import (
    _get_profile,
    _parse_json_body,
    _patient_model,
    _patient_permissions,
    _worker_url,
)

logger = logging.getLogger(__name__)


@login_required
@csrf_exempt
@require_http_methods(["POST"])
def worker_session_ready(request):
    profile = _get_profile(request)
    if not profile:
        return JsonResponse({"error": "No active project"}, status=403)

    try:
        data = _parse_json_body(request)
    except ValueError:
        return JsonResponse({"error": "Invalid JSON body"}, status=400)

    patient_id = data.get("patientId")
    video_source = (data.get("video_source") or "").strip()
    video_id = (data.get("video_id") or "").strip()

    if patient_id is None:
        return JsonResponse({"error": "patientId is required"}, status=400)
    if not video_source:
        return JsonResponse({"error": "video_source is required"}, status=400)
    if not video_id:
        return JsonResponse({"error": "video_id is required"}, status=400)

    try:
        patient_id = int(patient_id)
    except (TypeError, ValueError):
        return JsonResponse({"error": "patientId must be an integer"}, status=400)

    Patient = _patient_model()
    patient = get_object_or_404(Patient, patient_id=patient_id, project=profile.project)

    can_view, _ = _patient_permissions(profile, patient)
    if not can_view:
        return JsonResponse({"error": "Permission denied"}, status=403)

    worker_url = _worker_url(request, "/api/session/ready/", "WORKER_SESSION_READY_URL")
    payload = {
        "video_source": video_source,
        "video_id": video_id,
    }

    req = urllib_request.Request(
        worker_url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib_request.urlopen(req, timeout=10) as resp:
            status_code = resp.getcode()
            body = resp.read().decode("utf-8")
    except urllib_error.HTTPError as exc:
        error_body = exc.read().decode("utf-8", errors="replace")
        logger.error(
            "Worker session-ready HTTP error %s for patient %s: %s",
            exc.code,
            patient.patient_id,
            error_body,
        )
        return JsonResponse(
            {
                "error": "Worker session ready request failed",
                "worker_status": exc.code,
                "worker_response": error_body,
            },
            status=502,
        )
    except urllib_error.URLError as exc:
        logger.error(
            "Worker session-ready network error for patient %s: %s",
            patient.patient_id,
            exc,
        )
        return JsonResponse(
            {"error": "Worker service unavailable", "details": str(exc)},
            status=502,
        )

    try:
        worker_response = json.loads(body) if body else {}
    except json.JSONDecodeError:
        worker_response = body

    return JsonResponse(
        {
            "success": True,
            "worker_status": status_code,
            "worker_response": worker_response,
        }
    )


@login_required
@csrf_exempt
@require_http_methods(["POST"])
def worker_session_prompt(request):
    profile = _get_profile(request)
    if not profile:
        return JsonResponse({"error": "No active project"}, status=403)

    try:
        data = _parse_json_body(request)
    except ValueError:
        return JsonResponse({"error": "Invalid JSON body"}, status=400)

    patient_id = data.get("patientId")
    video_id = (data.get("video_id") or "").strip()
    frame_timestamp_raw = data.get("frame_timestamp")
    window_seconds_raw = data.get("window_seconds", 5.0)
    normalized_default = bool(data.get("normalized", True))

    if patient_id is None:
        return JsonResponse({"error": "patientId is required"}, status=400)
    if not video_id:
        return JsonResponse({"error": "video_id is required"}, status=400)

    try:
        patient_id = int(patient_id)
    except (TypeError, ValueError):
        return JsonResponse({"error": "patientId must be an integer"}, status=400)

    try:
        frame_timestamp = float(frame_timestamp_raw)
    except (TypeError, ValueError):
        return JsonResponse({"error": "frame_timestamp must be numeric"}, status=400)
    if frame_timestamp < 0:
        return JsonResponse({"error": "frame_timestamp must be >= 0"}, status=400)

    try:
        window_seconds = float(window_seconds_raw)
    except (TypeError, ValueError):
        return JsonResponse({"error": "window_seconds must be numeric"}, status=400)
    if window_seconds <= 0:
        return JsonResponse({"error": "window_seconds must be > 0"}, status=400)

    def _parse_points(points_raw, point_labels_raw, normalized_flag, prefix):
        if points_raw is None and point_labels_raw is None:
            return None, None, None
        if not isinstance(points_raw, list) or not points_raw:
            return None, None, f"{prefix}points must be a non-empty list"
        if not isinstance(point_labels_raw, list):
            return None, None, f"{prefix}point_labels must be a list"
        if len(point_labels_raw) != len(points_raw):
            return None, None, f"{prefix}point_labels length must match points length"

        points = []
        labels = []
        for idx, point in enumerate(points_raw):
            if not isinstance(point, (list, tuple)) or len(point) != 2:
                return None, None, f"{prefix}points[{idx}] must be a [x, y] pair"
            try:
                x = float(point[0])
                y = float(point[1])
            except (TypeError, ValueError):
                return None, None, f"{prefix}points[{idx}] must contain numeric values"
            if normalized_flag and (x < 0 or x > 1 or y < 0 or y > 1):
                return (
                    None,
                    None,
                    f"{prefix}points[{idx}] must be normalized between 0 and 1",
                )
            points.append([x, y])

        for idx, label in enumerate(point_labels_raw):
            if isinstance(label, bool):
                return None, None, f"{prefix}point_labels[{idx}] must be 0 or 1"
            try:
                parsed_label = int(label)
            except (TypeError, ValueError):
                return None, None, f"{prefix}point_labels[{idx}] must be an integer"
            if parsed_label not in (0, 1):
                return None, None, f"{prefix}point_labels[{idx}] must be 0 or 1"
            labels.append(parsed_label)

        return points, labels, None

    def _parse_box(box_raw, normalized_flag, prefix):
        if box_raw is None:
            return None, None
        if not isinstance(box_raw, list) or len(box_raw) != 2:
            return None, f"{prefix}box must be [[x1, y1], [x2, y2]]"

        parsed_box = []
        for corner_idx, corner in enumerate(box_raw):
            if not isinstance(corner, (list, tuple)) or len(corner) != 2:
                return None, f"{prefix}box[{corner_idx}] must be [x, y]"
            try:
                x = float(corner[0])
                y = float(corner[1])
            except (TypeError, ValueError):
                return None, f"{prefix}box[{corner_idx}] must contain numeric values"
            if normalized_flag and (x < 0 or x > 1 or y < 0 or y > 1):
                return (
                    None,
                    f"{prefix}box[{corner_idx}] must be normalized between 0 and 1",
                )
            parsed_box.append([x, y])
        return parsed_box, None

    def _parse_mask(mask_b64_raw, mask_shape_raw, mask_encoding_raw, prefix):
        if (
            mask_b64_raw is None
            and mask_shape_raw is None
            and mask_encoding_raw is None
        ):
            return None, None, None, None
        if not mask_b64_raw:
            return (
                None,
                None,
                None,
                f"{prefix}mask_b64 is required when mask_shape is provided",
            )
        if mask_encoding_raw is None:
            return (
                None,
                None,
                None,
                f"{prefix}mask_encoding is required when mask_b64 is provided",
            )
        if not isinstance(mask_shape_raw, list) or len(mask_shape_raw) != 2:
            return None, None, None, f"{prefix}mask_shape must be [height, width]"
        try:
            mask_h = int(mask_shape_raw[0])
            mask_w = int(mask_shape_raw[1])
        except (TypeError, ValueError):
            return None, None, None, f"{prefix}mask_shape values must be integers"
        if mask_h <= 0 or mask_w <= 0:
            return None, None, None, f"{prefix}mask_shape values must be > 0"

        mask_encoding = str(mask_encoding_raw)
        if mask_encoding != "bitpack_u1_v1":
            return (
                None,
                None,
                None,
                f"{prefix}mask_encoding must be bitpack_u1_v1",
            )

        try:
            mask_bytes = base64.b64decode(str(mask_b64_raw), validate=True)
        except Exception:
            return None, None, None, f"{prefix}mask_b64 must be valid base64"

        expected_bytes = (mask_h * mask_w + 7) // 8
        if len(mask_bytes) != expected_bytes:
            return (
                None,
                None,
                None,
                (
                    f"{prefix}mask_b64 byte length must match bit-packed mask_shape "
                    f"(expected {expected_bytes}, got {len(mask_bytes)})"
                ),
            )

        return str(mask_b64_raw), [mask_h, mask_w], mask_encoding, None

    regions_raw = data.get("regions")
    legacy_prompt_fields = (
        "region_id",
        "class_name",
        "class_id",
        "points",
        "point_labels",
        "box",
        "mask_b64",
        "mask_encoding",
        "mask_shape",
    )

    if regions_raw is not None and any(field in data for field in legacy_prompt_fields):
        return JsonResponse(
            {"error": "use either regions or top-level prompt fields, not both"},
            status=400,
        )

    if regions_raw is None:
        regions_raw = [
            {
                "region_id": data.get("region_id", "1"),
                "class_name": data.get("class_name", "unknown"),
                "class_id": data.get("class_id"),
                "points": data.get("points"),
                "point_labels": data.get("point_labels"),
                "box": data.get("box"),
                "mask_b64": data.get("mask_b64"),
                "mask_encoding": data.get("mask_encoding"),
                "mask_shape": data.get("mask_shape"),
                "normalized": normalized_default,
            }
        ]

    if not isinstance(regions_raw, list) or not regions_raw:
        return JsonResponse({"error": "regions must be a non-empty list"}, status=400)

    regions_payload = []
    seen_region_ids = set()
    for ridx, region_raw in enumerate(regions_raw):
        prefix = f"regions[{ridx}]."
        if not isinstance(region_raw, dict):
            return JsonResponse(
                {"error": f"regions[{ridx}] must be an object"}, status=400
            )

        region_id = region_raw.get("region_id")
        if region_id is None or str(region_id).strip() == "":
            return JsonResponse({"error": f"{prefix}region_id is required"}, status=400)
        region_id = str(region_id).strip()
        if region_id in seen_region_ids:
            return JsonResponse(
                {"error": "region_id values must be unique"}, status=400
            )
        seen_region_ids.add(region_id)

        region_normalized = bool(region_raw.get("normalized", normalized_default))
        points, point_labels, err = _parse_points(
            region_raw.get("points"),
            region_raw.get("point_labels"),
            region_normalized,
            prefix,
        )
        if err:
            return JsonResponse({"error": err}, status=400)

        box, err = _parse_box(region_raw.get("box"), region_normalized, prefix)
        if err:
            return JsonResponse({"error": err}, status=400)

        mask_b64, mask_shape, mask_encoding, err = _parse_mask(
            region_raw.get("mask_b64"),
            region_raw.get("mask_shape"),
            region_raw.get("mask_encoding"),
            prefix,
        )
        if err:
            return JsonResponse({"error": err}, status=400)

        if points is None and box is None and mask_b64 is None:
            return JsonResponse(
                {
                    "error": (
                        f"{prefix}must include at least one prompt: points, box, or mask"
                    )
                },
                status=400,
            )

        payload_region = {
            "region_id": region_id,
            "class_name": str(region_raw.get("class_name") or "unknown"),
            "normalized": region_normalized,
        }
        class_id = region_raw.get("class_id")
        if class_id is not None:
            payload_region["class_id"] = str(class_id)
        if points is not None:
            payload_region["points"] = points
            payload_region["point_labels"] = point_labels
        if box is not None:
            payload_region["box"] = box
        if mask_b64 is not None:
            payload_region["mask_b64"] = mask_b64
            payload_region["mask_encoding"] = mask_encoding
            payload_region["mask_shape"] = mask_shape

        regions_payload.append(payload_region)

    Patient = _patient_model()
    patient = get_object_or_404(Patient, patient_id=patient_id, project=profile.project)
    can_view, _ = _patient_permissions(profile, patient)
    if not can_view:
        return JsonResponse({"error": "Permission denied"}, status=403)

    worker_url = _worker_url(
        request, "/api/session/prompt/", "WORKER_SESSION_PROMPT_URL"
    )
    payload = {
        "video_id": video_id,
        "frame_timestamp": frame_timestamp,
        "regions": regions_payload,
        "window_seconds": window_seconds,
        "normalized": normalized_default,
    }

    req = urllib_request.Request(
        worker_url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib_request.urlopen(req, timeout=20) as resp:
            status_code = resp.getcode()
            body = resp.read().decode("utf-8")
    except urllib_error.HTTPError as exc:
        error_body = exc.read().decode("utf-8", errors="replace")
        logger.error(
            "Worker session-prompt HTTP error %s for patient %s: %s",
            exc.code,
            patient.patient_id,
            error_body,
        )
        return JsonResponse(
            {
                "error": "Worker session prompt request failed",
                "worker_status": exc.code,
                "worker_response": error_body,
            },
            status=502,
        )
    except urllib_error.URLError as exc:
        logger.error(
            "Worker session-prompt network error for patient %s: %s",
            patient.patient_id,
            exc,
        )
        return JsonResponse(
            {"error": "Worker service unavailable", "details": str(exc)},
            status=502,
        )

    try:
        worker_response = json.loads(body) if body else {}
    except json.JSONDecodeError:
        worker_response = body

    return JsonResponse(
        {
            "success": True,
            "worker_status": status_code,
            "worker_response": worker_response,
        }
    )
