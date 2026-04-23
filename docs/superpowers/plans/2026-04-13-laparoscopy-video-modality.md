# Laparoscopy Video Modality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a video upload modality to the laparoscopy project that stores the original file, creates an async ffmpeg compression job, and displays an HTML5 video player on the patient detail page.

**Architecture:** Plan A — extend the existing maxillo upload view to handle a `video` field (same pattern as brain MRI slugs), add a `video` completion handler in `mark_job_completed`, and add a laparoscopy-specific patient detail template with a range-aware video serve endpoint. The `common.Job` system (status: pending → processing → completed) is the async mechanism; an external worker polls `/laparoscopy/api/processing/jobs/pending/video/` and runs ffmpeg.

**Tech Stack:** Django 5.2, MySQL, ffmpeg (external worker), HTML5 `<video>`, XHR upload progress.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `common/models.py` | Modify | Add `video_raw` and `video_compressed` to `FileRegistry.FILE_TYPE_CHOICES` |
| `common/migrations/0024_add_video_file_types.py` | Create | Django state migration for choices change |
| `maxillo/file_utils.py` | Modify | Add `elif modality_slug == 'video'` block in `mark_job_completed` to register compressed output |
| `maxillo/views/patient_upload.py` | Modify | Add video file handler block after panoramic |
| `templates/common/upload/modalities/video.html` | Create | Upload form partial with XHR progress bar |
| `templates/laparoscopy/patient_detail_content.html` | Create | Patient detail with HTML5 player + download buttons |
| `laparoscopy/views.py` | Create | Range-aware video serve view |
| `laparoscopy/urls.py` | Modify | Add video serve URL |
| `laparoscopy/management/__init__.py` | Create | Package init |
| `laparoscopy/management/commands/__init__.py` | Create | Package init |
| `laparoscopy/management/commands/setup_video_modality.py` | Create | Creates `Modality(slug='video')` and assigns to laparoscopy project |

---

### Task 1: Add video file types to FileRegistry

**Files:**
- Modify: `common/models.py`
- Create: `common/migrations/0024_add_video_file_types.py`

- [ ] **Step 1: Add choices to `FileRegistry.FILE_TYPE_CHOICES` in `common/models.py`**

Find the `FILE_TYPE_CHOICES` list (around line 436) and add after the `panoramic_processed` entry:

```python
        ('video_raw', 'Video Raw'),
        ('video_compressed', 'Video Compressed'),
```

The full tail of the list should look like:
```python
        ('panoramic_raw', 'panoramic Raw'),
        ('panoramic_processed', 'panoramic Processed'),
        ('video_raw', 'Video Raw'),
        ('video_compressed', 'Video Compressed'),
    ]
```

- [ ] **Step 2: Generate and run migration**

```bash
make makemigrations
make migrate
```

Expected: one new migration file under `common/migrations/` with an `AlterField` on `fileregistry.file_type`. Django will print `Applying common.0024_...OK`.

- [ ] **Step 3: Verify Django system check passes**

```bash
make manage ARGS='check'
```

Expected: `System check identified no issues (0 silenced).`

- [ ] **Step 4: Commit**

```bash
git add common/models.py common/migrations/
git commit -m "feat(common): add video_raw and video_compressed FileRegistry file types"
```

---

### Task 2: Handle video completion in `mark_job_completed`

**Files:**
- Modify: `maxillo/file_utils.py` (around line 1231, just before `logger.info("mark_job_completed completed successfully")`)

- [ ] **Step 1: Add the `video` completion branch**

In `mark_job_completed`, find the last `elif` before the final `logger.info(f"mark_job_completed completed successfully")` line (currently the bite_classification block ends around line 1229). Add after it:

```python
        elif job_patient and job.modality_slug == 'video':
            compressed_path = None
            for key, path in output_files.items():
                if key == 'video_compressed' or (isinstance(path, str) and path.endswith('.mp4')):
                    compressed_path = path
                    break

            if compressed_path and os.path.exists(compressed_path):
                file_hash = calculate_file_hash(compressed_path)
                file_size = os.path.getsize(compressed_path)
                from common.models import Modality as _Modality
                modality = _Modality.objects.filter(slug='video').first()
                FileRegistry.objects.create(
                    file_type='video_compressed',
                    file_path=compressed_path,
                    file_size=file_size,
                    file_hash=file_hash,
                    modality=modality,
                    processing_job=job,
                    **_job_entity_fk_kwargs(job),
                    metadata={
                        'processed_at': timezone.now().isoformat(),
                        'logs': logs or '',
                    }
                )
                logger.info(f"Registered compressed video at {compressed_path} for patient {getattr(job_patient, 'patient_id', 'unknown')}")
            else:
                logger.warning(f"Video compression job {job.id} completed but no valid output path found in {output_files}")
```

- [ ] **Step 2: Verify Django system check still passes**

```bash
make manage ARGS='check'
```

Expected: `System check identified no issues (0 silenced).`

- [ ] **Step 3: Commit**

```bash
git add maxillo/file_utils.py
git commit -m "feat(maxillo): register compressed video FileRegistry entry on job completion"
```

---

### Task 3: Handle video upload in the patient upload view

**Files:**
- Modify: `maxillo/views/patient_upload.py`

- [ ] **Step 1: Add the video upload handler block**

In `maxillo/views/patient_upload.py`, find the intraoral photos handler (ends around line 173 with `except Exception as e: messages.error(request, f"Error saving Intraoral Photos: {e}")`). Add the following block immediately after it (before the `brain_modalities` dict):

```python
            # Handle Video (laparoscopy)
            video_file = request.FILES.get('video')
            if video_file:
                try:
                    modality = Modality.objects.get(slug='video')
                    patient.modalities.add(modality)
                    from ..file_utils import save_generic_modality_file
                    fr, job = save_generic_modality_file(patient, 'video', video_file)
                    if fr:
                        uploaded_modalities.append('Video')
                        if job:
                            processing_job_ids.append(job.id)
                except Modality.DoesNotExist:
                    logger.warning('Video modality not found in DB; run setup_video_modality management command')
                except Exception as e:
                    messages.error(request, f"Error saving Video: {e}")
```

- [ ] **Step 2: Verify Django system check passes**

```bash
make manage ARGS='check'
```

Expected: `System check identified no issues (0 silenced).`

- [ ] **Step 3: Commit**

```bash
git add maxillo/views/patient_upload.py
git commit -m "feat(maxillo): handle video file upload in patient upload view"
```

---

### Task 4: Create the video upload template partial

**Files:**
- Create: `templates/common/upload/modalities/video.html`

- [ ] **Step 1: Create the template**

```html
<div class="mb-4" id="video-upload-section">
    <h6 class="mb-2"><i class="fas fa-video me-2"></i>Laparoscopy Video</h6>
    <div class="mb-3">
        <label for="id_video" class="form-label">Video File</label>
        <input
            type="file"
            name="video"
            id="id_video"
            class="form-control"
            accept="video/*"
        >
        <div class="form-text">
            Any video format accepted. Files larger than 500 MB are supported.
            A compressed MP4 (audio stripped) will be generated automatically after upload.
        </div>
    </div>

    <!-- Upload progress (shown only during XHR upload) -->
    <div id="video-upload-progress" class="d-none">
        <div class="d-flex justify-content-between mb-1">
            <small class="text-muted">Uploading video…</small>
            <small id="video-upload-pct" class="text-muted">0%</small>
        </div>
        <div class="progress" style="height: 6px;">
            <div id="video-upload-bar"
                 class="progress-bar progress-bar-striped progress-bar-animated"
                 role="progressbar"
                 style="width: 0%"
                 aria-valuenow="0" aria-valuemin="0" aria-valuemax="100">
            </div>
        </div>
    </div>
</div>

<script>
(function () {
    const fileInput = document.getElementById('id_video');
    const form = fileInput ? fileInput.closest('form') : null;
    if (!form || !fileInput) return;

    const progressWrap = document.getElementById('video-upload-progress');
    const bar = document.getElementById('video-upload-bar');
    const pct = document.getElementById('video-upload-pct');

    form.addEventListener('submit', function (e) {
        // Only intercept when a video file is selected
        if (!fileInput.files || fileInput.files.length === 0) return;

        e.preventDefault();

        progressWrap.classList.remove('d-none');

        const formData = new FormData(form);
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', function (ev) {
            if (ev.lengthComputable) {
                const percent = Math.round((ev.loaded / ev.total) * 100);
                bar.style.width = percent + '%';
                bar.setAttribute('aria-valuenow', percent);
                pct.textContent = percent + '%';
            }
        });

        xhr.addEventListener('load', function () {
            // Server redirects after successful POST — follow it
            window.location.href = xhr.responseURL || window.location.href;
        });

        xhr.addEventListener('error', function () {
            progressWrap.classList.add('d-none');
            alert('Upload failed. Please try again.');
        });

        xhr.open(form.method || 'POST', form.action || window.location.pathname);
        xhr.send(formData);
    });
})();
</script>
```

- [ ] **Step 2: Verify the template is discoverable**

```bash
make manage ARGS='check'
```

Expected: `System check identified no issues (0 silenced).`

- [ ] **Step 3: Commit**

```bash
git add templates/common/upload/modalities/video.html
git commit -m "feat(templates): add video upload modality partial with XHR progress bar"
```

---

### Task 5: Create the laparoscopy management commands package and setup command

**Files:**
- Create: `laparoscopy/management/__init__.py`
- Create: `laparoscopy/management/commands/__init__.py`
- Create: `laparoscopy/management/commands/setup_video_modality.py`

- [ ] **Step 1: Create package inits**

Create `laparoscopy/management/__init__.py` (empty file):
```python
```

Create `laparoscopy/management/commands/__init__.py` (empty file):
```python
```

- [ ] **Step 2: Create the management command**

Create `laparoscopy/management/commands/setup_video_modality.py`:

```python
"""
Management command to create the 'video' Modality and assign it to the
laparoscopy project. Safe to run multiple times (idempotent).

Usage:
    make manage ARGS='setup_video_modality'
"""
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model

from common.models import Modality, Project


class Command(BaseCommand):
    help = "Create the video modality and assign it to the laparoscopy project."

    def handle(self, *args, **options):
        User = get_user_model()
        admin_user = User.objects.filter(is_superuser=True).first()

        # Create or update the video modality
        modality, created = Modality.objects.get_or_create(
            slug='video',
            defaults={
                'name': 'Video',
                'description': 'Laparoscopy surgical video recording',
                'icon': 'fas fa-video',
                'supported_extensions': [],
                'requires_multiple_files': False,
                'is_active': True,
                'created_by': admin_user,
            }
        )

        if created:
            self.stdout.write(self.style.SUCCESS(f"Created Modality: {modality.name} (slug='{modality.slug}')"))
        else:
            self.stdout.write(f"Modality '{modality.slug}' already exists — skipping creation.")

        # Assign to the laparoscopy project
        project = Project.objects.filter(slug='laparoscopy').first()
        if not project:
            project = Project.objects.create(
                name='Laparoscopy',
                slug='laparoscopy',
                description='Laparoscopy surgical video project',
                created_by=admin_user,
            )
            self.stdout.write(self.style.SUCCESS("Created laparoscopy project."))

        if modality not in project.modalities.all():
            project.modalities.add(modality)
            self.stdout.write(self.style.SUCCESS(f"Assigned '{modality.slug}' to project '{project.slug}'."))
        else:
            self.stdout.write(f"Modality already assigned to project '{project.slug}' — skipping.")

        self.stdout.write(self.style.SUCCESS("setup_video_modality complete."))
```

- [ ] **Step 3: Run the command**

```bash
make manage ARGS='setup_video_modality'
```

Expected output:
```
Created Modality: Video (slug='video')
Assigned 'video' to project 'laparoscopy'.
setup_video_modality complete.
```

(If run again, the "already exists" / "already assigned" messages appear instead.)

- [ ] **Step 4: Commit**

```bash
git add laparoscopy/management/
git commit -m "feat(laparoscopy): add setup_video_modality management command"
```

---

### Task 6: Add range-aware video serve view and URL

**Files:**
- Modify: `laparoscopy/views.py`
- Modify: `laparoscopy/urls.py`

- [ ] **Step 1: Write the video serve view in `laparoscopy/views.py`**

Replace the entire file with:

```python
import os
import re
import logging

from django.contrib.auth.decorators import login_required
from django.http import StreamingHttpResponse, HttpResponse
from django.shortcuts import get_object_or_404, redirect
from django.contrib import messages

from common.models import Project, ProjectAccess, FileRegistry

logger = logging.getLogger(__name__)

_CHUNK = 8 * 1024 * 1024  # 8 MB chunks


def _file_iterator(path, start, end):
    """Yield chunks of a file between byte positions start and end (inclusive)."""
    with open(path, 'rb') as f:
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
    Serves any FileRegistry entry whose file_type is video_raw or video_compressed.
    """
    file_obj = get_object_or_404(
        FileRegistry,
        id=file_id,
        file_type__in=['video_raw', 'video_compressed'],
    )

    file_path = file_obj.file_path
    if not os.path.exists(file_path):
        return HttpResponse('File not found on disk.', status=404)

    file_size = os.path.getsize(file_path)

    # Determine content type
    if file_obj.file_type == 'video_compressed':
        content_type = 'video/mp4'
    else:
        # Try to guess from extension for raw files
        ext = os.path.splitext(file_path)[1].lower()
        content_type_map = {
            '.mp4': 'video/mp4',
            '.mkv': 'video/x-matroska',
            '.avi': 'video/x-msvideo',
            '.mov': 'video/quicktime',
            '.webm': 'video/webm',
        }
        content_type = content_type_map.get(ext, 'video/octet-stream')

    range_header = request.META.get('HTTP_RANGE', '').strip()

    if range_header:
        match = re.match(r'bytes=(\d+)-(\d*)', range_header)
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
        response['Content-Length'] = length
        response['Content-Range'] = f'bytes {start}-{end}/{file_size}'
    else:
        response = StreamingHttpResponse(
            _file_iterator(file_path, 0, file_size - 1),
            status=200,
            content_type=content_type,
        )
        response['Content-Length'] = file_size

    response['Accept-Ranges'] = 'bytes'
    return response


@login_required
def set_laparoscopy(request):
    proj = (
        Project.objects.filter(slug='laparoscopy').first()
        or Project.objects.filter(name__iexact='laparoscopy').first()
    )
    if not proj:
        proj = Project.objects.create(name='laparoscopy', slug='laparoscopy')

    if not (request.user.profile.is_admin or request.user.profile.is_student_developer):
        has_access = ProjectAccess.objects.filter(
            user=request.user,
            project=proj,
        ).exists()
        if not has_access:
            messages.error(request, "You don't have access to the laparoscopy project.")
            return redirect('home')

    request.session['current_project_id'] = proj.id
    return redirect('laparoscopy:patient_list')
```

- [ ] **Step 2: Update `laparoscopy/urls.py`**

Replace the entire file with:

```python
from django.urls import path, include

from . import views

urlpatterns = [
    # Project switcher
    path('', views.set_laparoscopy, name='laparoscopy_home'),

    # Range-aware video serve (outside the maxillo include so it has no namespace conflict)
    path('video/<int:file_id>/', views.serve_video, name='laparoscopy_serve_video'),

    # All other maxillo views under the 'laparoscopy' instance namespace
    path('', include(('maxillo.app_urls', 'maxillo'), namespace='laparoscopy')),
]
```

- [ ] **Step 3: Verify system check**

```bash
make manage ARGS='check'
```

Expected: `System check identified no issues (0 silenced).`

- [ ] **Step 4: Commit**

```bash
git add laparoscopy/views.py laparoscopy/urls.py
git commit -m "feat(laparoscopy): add range-aware video serve view at /laparoscopy/video/<id>/"
```

---

### Task 7: Create the laparoscopy patient detail template

**Files:**
- Create: `templates/laparoscopy/patient_detail_content.html`

The existing `patient_detail` view (maxillo) already provides `patient_files` as:
```python
patient_files = {
    'raw': [{'id': ..., 'file_type': ..., 'file_size_mb': ..., 'filename': ..., ...}],
    'processed': [...],
    'other': [...],
}
```
We iterate those lists in the template to find video entries.

- [ ] **Step 1: Create the template directory**

```bash
mkdir -p templates/laparoscopy
```

- [ ] **Step 2: Create `templates/laparoscopy/patient_detail_content.html`**

```html
{% load static %}

<div class="container-fluid">
    <div class="row justify-content-center">
        <div class="col-lg-9">

            <!-- Patient header -->
            <div class="d-flex justify-content-between align-items-center mb-4">
                <h4><i class="fas fa-video me-2"></i>{{ patient.name|default:"Patient "|add:patient.patient_id|stringformat:"s" }}</h4>
                <span class="badge bg-secondary">ID {{ patient.patient_id }}</span>
            </div>

            <!-- Video player card -->
            {% with ns=request.resolver_match.namespace %}
            {% comment %}
                Find raw and compressed video FileRegistry entries from context.
                patient_files.raw / patient_files.processed are lists of dicts:
                  { id, file_type, file_size_mb, filename, original_filename, ... }
            {% endcomment %}

            {% with raw_video=None compressed_video=None %}
            {# Locate raw video #}
            {% for f in patient_files.raw %}
                {% if f.file_type == 'video_raw' %}
                    {% with raw_video=f %}{% endwith %}
                {% endif %}
            {% endfor %}
            {# Locate compressed video #}
            {% for f in patient_files.processed %}
                {% if f.file_type == 'video_compressed' %}
                    {% with compressed_video=f %}{% endwith %}
                {% endif %}
            {% endfor %}

            {# Django template scoping: re-read from patient_files directly in one pass #}
            {% endwith %}

            {% comment %}
                Django's {% with %} scope doesn't persist across blocks, so we do a
                single-pass scan using template variables set within the for loops.
            {% endcomment %}

            <div class="card mb-4">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <h5 class="mb-0"><i class="fas fa-play-circle me-2"></i>Video</h5>

                    <!-- Download buttons (built lazily below once we find file IDs) -->
                    <div id="video-download-btns" class="d-flex gap-2"></div>
                </div>
                <div class="card-body p-0" id="video-player-wrap">
                    <p class="text-muted p-3 mb-0" id="video-no-file">
                        <i class="fas fa-hourglass-half me-2"></i>No video uploaded yet.
                    </p>
                </div>
            </div>

            <!-- Processing jobs status -->
            {% include 'common/sections/scan_settings_section.html' %}
            {% include 'common/sections/file_management_section.html' %}
            {% include 'common/sections/vocal_caption_section.html' %}

            {% endwith %}
        </div>
    </div>
</div>

<script>
(function () {
    // Inject video player from Django context passed via JSON
    const rawFiles = {{ patient_files.raw|safe_json|default:"[]" }};
    const processedFiles = {{ patient_files.processed|safe_json|default:"[]" }};

    // Serialise patient_files dicts to JSON for JS consumption
    // (the template tag safe_json is not available; use the inline approach below)
    const allRaw = JSON.parse(document.getElementById('_pf_raw').textContent);
    const allProcessed = JSON.parse(document.getElementById('_pf_processed').textContent);

    const rawVideo = allRaw.find(f => f.file_type === 'video_raw');
    const compressedVideo = allProcessed.find(f => f.file_type === 'video_compressed');

    const playerWrap = document.getElementById('video-player-wrap');
    const noFile = document.getElementById('video-no-file');
    const dlBtns = document.getElementById('video-download-btns');
    const baseUrl = '/laparoscopy/video/';

    if (!rawVideo && !compressedVideo) {
        return; // nothing to show
    }

    noFile.remove();

    // Decide which file to play
    const playFile = compressedVideo || rawVideo;
    const isProcessing = rawVideo && !compressedVideo;

    // Build video element
    const video = document.createElement('video');
    video.controls = true;
    video.style.width = '100%';
    video.style.display = 'block';
    video.setAttribute('preload', 'metadata');
    video.src = baseUrl + playFile.id + '/';
    playerWrap.appendChild(video);

    // Processing badge
    if (isProcessing) {
        const badge = document.createElement('div');
        badge.className = 'alert alert-info m-3 mb-0 d-flex align-items-center gap-2';
        badge.innerHTML = '<span class="spinner-border spinner-border-sm" role="status"></span>' +
            '<span>Compressed version is being generated. Playing original for now.</span>';
        playerWrap.appendChild(badge);
    }

    // Download buttons
    if (rawVideo) {
        const a = document.createElement('a');
        a.href = baseUrl + rawVideo.id + '/';
        a.className = 'btn btn-sm btn-outline-secondary';
        a.innerHTML = '<i class="fas fa-download me-1"></i>Original (' + rawVideo.file_size_mb + ' MB)';
        a.download = rawVideo.original_filename || rawVideo.filename || 'video_original';
        dlBtns.appendChild(a);
    }
    if (compressedVideo) {
        const a = document.createElement('a');
        a.href = baseUrl + compressedVideo.id + '/';
        a.className = 'btn btn-sm btn-outline-primary';
        a.innerHTML = '<i class="fas fa-file-video me-1"></i>Compressed MP4 (' + compressedVideo.file_size_mb + ' MB)';
        a.download = compressedVideo.original_filename || compressedVideo.filename || 'video_compressed.mp4';
        dlBtns.appendChild(a);
    }
})();
</script>

<!-- Inline JSON for JS to consume (avoids template filter dependency) -->
<script id="_pf_raw" type="application/json">
[{% for f in patient_files.raw %}{"id":{{ f.id }},"file_type":"{{ f.file_type }}","file_size_mb":"{{ f.file_size_mb }}","filename":"{{ f.filename }}","original_filename":"{{ f.original_filename }}"}{% if not forloop.last %},{% endif %}{% endfor %}]
</script>
<script id="_pf_processed" type="application/json">
[{% for f in patient_files.processed %}{"id":{{ f.id }},"file_type":"{{ f.file_type }}","file_size_mb":"{{ f.file_size_mb }}","filename":"{{ f.filename }}","original_filename":"{{ f.original_filename }}"}{% if not forloop.last %},{% endif %}{% endfor %}]
</script>
```

- [ ] **Step 3: Verify system check**

```bash
make manage ARGS='check'
```

Expected: `System check identified no issues (0 silenced).`

- [ ] **Step 4: Commit**

```bash
git add templates/laparoscopy/
git commit -m "feat(laparoscopy): add patient detail template with HTML5 video player"
```

---

### Task 8: End-to-end smoke test

No automated test suite exists for this project. Verify manually by:

- [ ] **Step 1: Start the stack**

```bash
make up && make web-logs
```

- [ ] **Step 2: Run the setup command**

```bash
make manage ARGS='setup_video_modality'
```

Expected: success messages for modality and project assignment.

- [ ] **Step 3: Browse to `/laparoscopy/upload/`**

Log in as a user with upload permission. Confirm the **Video** section appears in the upload form.

- [ ] **Step 4: Upload a small test video**

Upload any `.mp4` (or other format). Confirm:
- Page redirects to patient list with a success message.
- The message includes `Video` and a processing job ID (e.g. `Processing jobs: #42`).

- [ ] **Step 5: Browse to the patient detail page**

Navigate to the new patient. Confirm:
- A **Video** card appears.
- The raw video plays in the browser (HTML5 player).
- A "Compressed version is being generated" badge is shown.
- An **Original** download button appears.

- [ ] **Step 6: Simulate job completion (manual)**

Find the job ID from the upload message. Post a fake completion:

```bash
curl -X POST http://localhost:8000/laparoscopy/api/processing/jobs/<JOB_ID>/completed/ \
  -H "Content-Type: application/json" \
  -d '{"output_files": {"video_compressed": "/dataset/maxillo/processed/video/test_compressed.mp4"}}'
```

(You'll need to create a dummy MP4 at that path inside the container first:
`make web-shell` → `mkdir -p /dataset/maxillo/processed/video && cp /dataset/maxillo/raw/video/*.* /dataset/maxillo/processed/video/test_compressed.mp4`)

- [ ] **Step 7: Refresh the patient detail page**

Confirm:
- The processing badge is gone.
- The compressed MP4 plays.
- Both **Original** and **Compressed MP4** download buttons appear.

- [ ] **Step 8: Final commit (if any fixups were made)**

```bash
git add -p
git commit -m "fix(laparoscopy): smoke test fixups"
```
