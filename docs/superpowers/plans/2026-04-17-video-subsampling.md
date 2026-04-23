# Video Subsampling Post-Processing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On video upload, produce a 1-fps subsampled MP4 (`subsampled_<name>.mp4`) alongside the existing compressed MP4, tracked as its own `Job` + `FileRegistry(file_type='video_subsampled')` row, and expose its serve URL as `window.subsampledVideoPath` in the laparoscopy patient detail page.

**Architecture:** A new daemon thread (`launch_video_subsampling`) in `laparoscopy/file_utils.py` mirrors the existing `launch_video_compression` pattern exactly — ffmpeg runs with `-vf fps=1`, then calls `mark_job_completed` which creates the `FileRegistry` entry. A second `Job` row (modality_slug=`'video_subsampled'`) is created in `patient_upload.py` right after the compression job and both threads are launched concurrently.

**Tech Stack:** Python/Django, ffmpeg (`-vf fps=1`), SQLite/MySQL via Django ORM

---

### Task 1: Add `video_subsampled` file type to FileRegistry

**Files:**
- Modify: `common/models.py:470`

- [ ] **Step 1: Add the new file type choice**

In `common/models.py`, after line `('video_compressed', 'Video Compressed'),` add:

```python
('video_subsampled', 'Video Subsampled'),
```

The block should look like:
```python
# Laparoscopy video modality
('video_raw', 'Video Raw'),
('video_compressed', 'Video Compressed'),
('video_subsampled', 'Video Subsampled'),
```

- [ ] **Step 2: Create and apply migration**

```bash
make makemigrations
make migrate
```

Expected: new migration file in `common/migrations/`, applied cleanly.

- [ ] **Step 3: Verify Django system check passes**

```bash
make manage ARGS='check'
```

Expected: `System check identified no issues (0 silenced).`

- [ ] **Step 4: Commit**

```bash
git add common/models.py common/migrations/
git commit -m "feat: add video_subsampled FileRegistry file type"
```

---

### Task 2: Add subsampling functions to `laparoscopy/file_utils.py`

**Files:**
- Modify: `laparoscopy/file_utils.py` (append after `launch_video_compression`)

- [ ] **Step 1: Add `_run_subsampling` and `launch_video_subsampling`**

Append to the end of `laparoscopy/file_utils.py`:

```python


def _run_subsampling(job_id, input_path, output_path):
    """
    Target function for the background subsampling thread.

    Runs ffmpeg to produce a 1-fps MP4, then updates Job status and registers
    the output FileRegistry entry via mark_job_completed.
    """
    from django.db import close_old_connections
    from maxillo.file_utils import mark_job_completed, mark_job_failed
    from common.models import Job

    close_old_connections()
    try:
        job = Job.objects.get(id=job_id)
        job.mark_processing('ffmpeg-subsample-thread')

        os.makedirs(os.path.dirname(output_path), exist_ok=True)

        result = subprocess.run(
            [
                'ffmpeg', '-y',
                '-i', input_path,
                '-vf', 'fps=1',
                '-an',
                '-c:v', 'libx264',
                '-crf', '28',
                output_path,
            ],
            capture_output=True,
            text=True,
        )

        if result.returncode == 0:
            mark_job_completed(job_id, {'video_subsampled': output_path})
            logger.info(f"Video subsampling job {job_id} completed: {output_path}")
        else:
            error_msg = result.stderr[-2000:] if result.stderr else 'ffmpeg exited non-zero'
            mark_job_failed(job_id, error_msg, can_retry=False)
            logger.error(f"Video subsampling job {job_id} failed (rc={result.returncode}): {result.stderr[-500:]}")

    except Exception as exc:
        logger.exception(f"Unexpected error in video subsampling thread for job {job_id}: {exc}")
        try:
            from maxillo.file_utils import mark_job_failed
            mark_job_failed(job_id, str(exc), can_retry=False)
        except Exception:
            pass
    finally:
        close_old_connections()


def launch_video_subsampling(job_id, input_path, output_path):
    """
    Spawn a daemon thread that subsamples a video to 1 fps with ffmpeg.

    Args:
        job_id:      ID of the pending common.Job row
        input_path:  Absolute path to the original raw video file
        output_path: Absolute path where the subsampled MP4 should be written
    """
    t = threading.Thread(
        target=_run_subsampling,
        args=(job_id, input_path, output_path),
        daemon=True,
        name=f'ffmpeg-subsample-job-{job_id}',
    )
    t.start()
    logger.info(f"Launched ffmpeg subsampling thread for job {job_id}: {input_path} -> {output_path}")
```

- [ ] **Step 2: Commit**

```bash
git add laparoscopy/file_utils.py
git commit -m "feat: add launch_video_subsampling background thread"
```

---

### Task 3: Handle `video_subsampled` in `mark_job_completed`

**Files:**
- Modify: `maxillo/file_utils.py` (inside `mark_job_completed`, after the `video_compressed` elif block, before the final `logger.info`)

- [ ] **Step 1: Add the elif block**

Find the section in `mark_job_completed` that ends with:
```python
            else:
                logger.warning(
                    f"Video compression job {job.id} completed but no valid output path "
                    f"found in {output_files}"
                )
```
(This is the end of the `elif job_patient and job.modality_slug == 'video':` block.)

Immediately after that closing block, before the line `logger.info(f"mark_job_completed completed successfully")`, insert:

```python
        elif job_patient and job.modality_slug == 'video_subsampled':
            subsampled_path = output_files.get('video_subsampled')
            if subsampled_path and os.path.exists(subsampled_path):
                file_hash = calculate_file_hash(subsampled_path)
                file_size = os.path.getsize(subsampled_path)
                from common.models import Modality as _Modality
                modality = _Modality.objects.filter(slug='video').first()
                FileRegistry.objects.create(
                    file_type='video_subsampled',
                    file_path=subsampled_path,
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
                logger.info(
                    f"Registered subsampled video at {subsampled_path} "
                    f"for patient {getattr(job_patient, 'patient_id', 'unknown')}"
                )
            else:
                logger.warning(
                    f"Video subsampling job {job.id} completed but no valid output path "
                    f"found in {output_files}"
                )
```

- [ ] **Step 2: Commit**

```bash
git add maxillo/file_utils.py
git commit -m "feat: register video_subsampled FileRegistry entry on job completion"
```

---

### Task 4: Update `serve_video` to serve `video_subsampled`

**Files:**
- Modify: `laparoscopy/views.py:53`

- [ ] **Step 1: Add `video_subsampled` to the allowed file types**

In `laparoscopy/views.py`, change:
```python
        file_type__in=["video_raw", "video_compressed"],
```
to:
```python
        file_type__in=["video_raw", "video_compressed", "video_subsampled"],
```

Also update the docstring on line 47 from:
```
    Serves any FileRegistry entry with file_type in ('video_raw', 'video_compressed').
```
to:
```
    Serves any FileRegistry entry with file_type in ('video_raw', 'video_compressed', 'video_subsampled').
```

- [ ] **Step 2: Commit**

```bash
git add laparoscopy/views.py
git commit -m "feat: serve_video also serves video_subsampled entries"
```

---

### Task 5: Launch subsampling job on video upload

**Files:**
- Modify: `maxillo/views/patient_upload.py` (inside the `if video_file:` block, after `launch_video_compression`)

- [ ] **Step 1: Create the subsampling job and launch the thread**

Find the block in `patient_upload.py` that ends with:
```python
                            launch_video_compression(job.id, fr.file_path, _out)
```

Replace the entire video-handling block (from `if fr:` through `launch_video_compression(...)`) with:

```python
                    if fr:
                        uploaded_modalities.append('Video')
                        if job:
                            processing_job_ids.append(job.id)
                            import os as _os
                            from common.models import Job as _Job
                            from laparoscopy.file_utils import launch_video_compression, launch_video_subsampling
                            _base = _os.path.splitext(_os.path.basename(fr.file_path))[0]
                            _processed_dir = _os.path.dirname(fr.file_path).replace('/raw/', '/processed/')

                            # Compression job (existing)
                            _out = _os.path.join(_processed_dir, _base + '_compressed.mp4')
                            launch_video_compression(job.id, fr.file_path, _out)

                            # Subsampling job (new) — 1 fps, own Job row
                            _sub_out = _os.path.join(_processed_dir, 'subsampled_' + _base + '.mp4')
                            sub_job = _Job.objects.create(
                                modality_slug='video_subsampled',
                                patient=patient,
                                brain_patient=None,
                                domain='maxillo',
                                input_file_path=fr.file_path,
                                status='pending',
                                output_files={},
                            )
                            processing_job_ids.append(sub_job.id)
                            launch_video_subsampling(sub_job.id, fr.file_path, _sub_out)
```

- [ ] **Step 2: Verify Django system check passes**

```bash
make manage ARGS='check'
```

Expected: `System check identified no issues (0 silenced).`

- [ ] **Step 3: Commit**

```bash
git add maxillo/views/patient_upload.py
git commit -m "feat: launch video subsampling job on upload alongside compression"
```

---

### Task 6: Expose subsampled video path in the patient detail template

**Files:**
- Modify: `templates/laparoscopy/patient_detail_content.html:258`

- [ ] **Step 1: Add the JS variable after the existing `compressedVideo` line**

Find:
```javascript
    var compressedVideo = allProcessed.find(function (f) { return f.file_type === 'video_compressed'; });
```

Replace with:
```javascript
    var compressedVideo    = allProcessed.find(function (f) { return f.file_type === 'video_compressed'; });
    var subsampledVideo    = allProcessed.find(function (f) { return f.file_type === 'video_subsampled'; });
    window.subsampledVideoPath = subsampledVideo ? '/laparoscopy/video/' + subsampledVideo.id + '/' : null;
```

- [ ] **Step 2: Commit**

```bash
git add templates/laparoscopy/patient_detail_content.html
git commit -m "feat: expose window.subsampledVideoPath in laparoscopy patient detail"
```
