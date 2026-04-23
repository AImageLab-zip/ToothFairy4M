import os
import re

from django.contrib.auth.decorators import login_required
from django.http import StreamingHttpResponse, HttpResponse

from common.models import FileRegistry
from django.shortcuts import get_object_or_404

_CHUNK = 8 * 1024 * 1024  # 8 MB read chunks


def _file_iterator(path, start, end):
    """Yield chunks of a file between byte positions start and end (inclusive)."""
    with open(path, "rb") as f:
        f.seek(start)
        remaining = end - start + 1
        while remaining > 0:
            chunk = f.read(min(_CHUNK, remaining))
            if not chunk:
                break
            remaining -= len(chunk)
            yield chunk


@login_required
def serve_video(request, file_id):
    """
    Range-aware video serve view so browsers can seek within the video.
    Serves any FileRegistry entry with file_type in ('video_raw', 'video_compressed', 'video_subsampled').
    Supports HTTP Range requests (RFC 7233) so HTML5 <video> seeking works.
    """
    file_obj = get_object_or_404(
        FileRegistry,
        id=file_id,
        file_type__in=["video_raw", "video_compressed", "video_subsampled"],
    )

    file_path = file_obj.file_path
    if not os.path.exists(file_path):
        return HttpResponse("File not found on disk.", status=404)

    file_size = os.path.getsize(file_path)

    # Determine MIME type
    if file_obj.file_type == "video_compressed":
        content_type = "video/mp4"
    else:
        ext = os.path.splitext(file_path)[1].lower()
        content_type = {
            ".mp4": "video/mp4",
            ".mkv": "video/x-matroska",
            ".avi": "video/x-msvideo",
            ".mov": "video/quicktime",
            ".webm": "video/webm",
        }.get(ext, "video/octet-stream")

    range_header = request.META.get("HTTP_RANGE", "").strip()

    if range_header:
        match = re.match(r"bytes=(\d+)-(\d*)", range_header)
        if match:
            start = int(match.group(1))
            end = int(match.group(2)) if match.group(2) else file_size - 1
        else:
            start, end = 0, file_size - 1

        end = min(end, file_size - 1)
        length = end - start + 1

        response = StreamingHttpResponse(
            _file_iterator(file_path, start, end),
            status=206,
            content_type=content_type,
        )
        response["Content-Length"] = length
        response["Content-Range"] = f"bytes {start}-{end}/{file_size}"
    else:
        response = StreamingHttpResponse(
            _file_iterator(file_path, 0, file_size - 1),
            status=200,
            content_type=content_type,
        )
        response["Content-Length"] = file_size

    response["Accept-Ranges"] = "bytes"
    return response
