"""
Laparoscopy-specific file utilities.

Currently handles background ffmpeg video compression: when a video is uploaded
the Django view calls launch_video_compression(), which spawns a daemon thread.
That thread runs ffmpeg, then updates the Job row and creates the compressed
FileRegistry entry directly via Django ORM — no external worker required.
"""

import os
import subprocess
import threading
import logging

logger = logging.getLogger(__name__)

SUBSAMPLE_FPS = 1  # frames-per-second for the subsampled video
SUBSAMPLE_START_SECOND = 0


def _run_compression(job_id, input_path, output_path):
    """
    Target function for the background compression thread.

    Runs ffmpeg synchronously, then updates the Job status and registers the
    output file in FileRegistry via the existing mark_job_completed / mark_job_failed
    helpers from maxillo.file_utils.

    Django thread-safety note: Django's DB connections are per-thread.
    close_old_connections() is called at entry and exit so Django opens a fresh
    connection for this thread rather than reusing the request thread's connection.
    """
    from django.db import close_old_connections
    from maxillo.file_utils import mark_job_completed, mark_job_failed
    from common.models import Job

    close_old_connections()
    try:
        job = Job.objects.get(id=job_id)
        job.mark_processing("ffmpeg-thread")

        os.makedirs(os.path.dirname(output_path), exist_ok=True)

        result = subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-i",
                input_path,
                "-an",  # drop audio track
                "-c:v",
                "libx264",  # H.264 lossy video codec
                "-crf",
                "28",  # quality level (higher = smaller file)
                output_path,
            ],
            capture_output=True,
            text=True,
        )

        if result.returncode == 0:
            mark_job_completed(job_id, {"video_compressed": output_path})
            logger.info(f"Video compression job {job_id} completed: {output_path}")
        else:
            # Keep the last 2000 chars of stderr to stay within the error_logs field
            error_msg = (
                result.stderr[-2000:] if result.stderr else "ffmpeg exited non-zero"
            )
            mark_job_failed(job_id, error_msg, can_retry=False)
            logger.error(
                f"Video compression job {job_id} failed (rc={result.returncode}): {result.stderr[-500:]}"
            )

    except Exception as exc:
        logger.exception(
            f"Unexpected error in video compression thread for job {job_id}: {exc}"
        )
        try:
            from maxillo.file_utils import mark_job_failed

            mark_job_failed(job_id, str(exc), can_retry=False)
        except Exception:
            pass
    finally:
        close_old_connections()


def launch_video_compression(job_id, input_path, output_path):
    """
    Spawn a daemon thread that compresses a video with ffmpeg and updates the DB.

    The thread is daemonised so it does not block Django's graceful shutdown.
    The request returns immediately; compression happens in the background.

    Args:
        job_id:      ID of the pending common.Job row
        input_path:  Absolute path to the original raw video file
        output_path: Absolute path where the compressed MP4 should be written
    """
    t = threading.Thread(
        target=_run_compression,
        args=(job_id, input_path, output_path),
        daemon=True,
        name=f"ffmpeg-job-{job_id}",
    )
    t.start()
    logger.info(
        f"Launched ffmpeg thread for job {job_id}: {input_path} -> {output_path}"
    )


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
        job.mark_processing("ffmpeg-subsample-thread")

        os.makedirs(os.path.dirname(output_path), exist_ok=True)

        result = subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-i",
                input_path,
                "-vf",
                f"fps=fps={SUBSAMPLE_FPS}:start_time={SUBSAMPLE_START_SECOND}:round=down",
                "-an",
                "-c:v",
                "libx264",
                "-movflags",
                "+faststart",
                "-g",
                "1",
                "-keyint_min",
                "1",
                "-sc_threshold",
                "0",
                "-crf",
                "28",
                output_path,
            ],
            capture_output=True,
            text=True,
        )

        if result.returncode == 0:
            mark_job_completed(job_id, {"video_subsampled": output_path})
            from common.models import FileRegistry

            FileRegistry.objects.filter(
                file_path=output_path, file_type="video_subsampled"
            ).update(metadata={"fps": SUBSAMPLE_FPS})
            logger.info(f"Video subsampling job {job_id} completed: {output_path}")
        else:
            error_msg = (
                result.stderr[-2000:] if result.stderr else "ffmpeg exited non-zero"
            )
            mark_job_failed(job_id, error_msg, can_retry=False)
            logger.error(
                f"Video subsampling job {job_id} failed (rc={result.returncode}): {result.stderr[-500:]}"
            )

    except Exception as exc:
        logger.exception(
            f"Unexpected error in video subsampling thread for job {job_id}: {exc}"
        )
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
        name=f"ffmpeg-subsample-job-{job_id}",
    )
    t.start()
    logger.info(
        f"Launched ffmpeg subsampling thread for job {job_id}: {input_path} -> {output_path}"
    )
