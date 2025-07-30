import os
import shutil
import hashlib
from pathlib import Path
from django.conf import settings
from django.utils import timezone
from .models import FileRegistry, ProcessingJob, VoiceCaption
import json


# Base directories
DATASET_ROOT = "/dataset"

# Directory structure
DATASET_DIRS = {
    'cbct': f"{DATASET_ROOT}/raw/cbct",
    'ios': f"{DATASET_ROOT}/raw/ios", 
    'audio': f"{DATASET_ROOT}/raw/audio",
}

PROCESSED_DIRS = {
    'cbct': f"{DATASET_ROOT}/processed/cbct",
    'ios': f"{DATASET_ROOT}/processed/ios",
    'audio': f"{DATASET_ROOT}/processed/audio",
}


def ensure_directories():
    """Ensure all required directories exist"""
    all_dirs = list(DATASET_DIRS.values()) + list(PROCESSED_DIRS.values())
    for dir_path in all_dirs:
        os.makedirs(dir_path, exist_ok=True)


def calculate_file_hash(file_path):
    """Calculate SHA256 hash of a file"""
    hash_sha256 = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(4096), b""):
            hash_sha256.update(chunk)
    return hash_sha256.hexdigest()


def save_cbct_to_dataset(scanpair, cbct_file):
    """
    Save CBCT file to /dataset/raw/cbct/ and create processing job
    
    Args:
        scanpair: ScanPair instance
        cbct_file: Django UploadedFile instance
        
    Returns:
        tuple: (file_path, processing_job)
    """
    ensure_directories()
    
    # Generate filename: cbct_scanpair_{id}_{patient_id}.nii.gz
    original_name = cbct_file.name
    extension = '.nii.gz' if original_name.endswith('.nii.gz') else '.nii'
    filename = f"cbct_scanpair_{scanpair.scanpair_id}_patient_{scanpair.patient.patient_id}{extension}"
    file_path = os.path.join(DATASET_DIRS['cbct'], filename)
    
    # Save file to dataset directory
    with open(file_path, 'wb+') as destination:
        for chunk in cbct_file.chunks():
            destination.write(chunk)
    
    # Calculate file hash and size
    file_hash = calculate_file_hash(file_path)
    file_size = os.path.getsize(file_path)
    
    # Create file registry entry
    file_registry = FileRegistry.objects.create(
        file_type='cbct_raw',
        file_path=file_path,
        file_size=file_size,
        file_hash=file_hash,
        scanpair=scanpair,
        metadata={
            'original_filename': original_name,
            'uploaded_at': timezone.now().isoformat(),
        }
    )
    
    # Create processing job
    processing_job = ProcessingJob.objects.create(
        job_type='cbct',
        scanpair=scanpair,
        input_file_path=file_path,
        docker_image='your-cbct-processor:latest',  # Configure as needed
        docker_command=[
            '--scanpair-id', str(scanpair.scanpair_id),
            '--patient-id', str(scanpair.patient.patient_id),
            '--input-file', file_path,
            '--output-dir', PROCESSED_DIRS['cbct']
        ]
    )
    
    return file_path, processing_job


def save_ios_to_dataset(scanpair, upper_file=None, lower_file=None):
    """
    Save IOS files to /dataset/raw/ios/ and create processing job
    
    Args:
        scanpair: ScanPair instance  
        upper_file: Django UploadedFile instance for upper scan
        lower_file: Django UploadedFile instance for lower scan
        
    Returns:
        dict: {'files': [...], 'processing_job': job}
    """
    ensure_directories()
    
    saved_files = []
    file_registries = []
    
    # Save upper scan if provided
    if upper_file:
        filename = f"ios_upper_scanpair_{scanpair.scanpair_id}_patient_{scanpair.patient.patient_id}.stl"
        file_path = os.path.join(DATASET_DIRS['ios'], filename)
        
        with open(file_path, 'wb+') as destination:
            for chunk in upper_file.chunks():
                destination.write(chunk)
        
        file_hash = calculate_file_hash(file_path)
        file_size = os.path.getsize(file_path)
        
        file_registry = FileRegistry.objects.create(
            file_type='ios_raw_upper',
            file_path=file_path,
            file_size=file_size,
            file_hash=file_hash,
            scanpair=scanpair,
            metadata={
                'original_filename': upper_file.name,
                'uploaded_at': timezone.now().isoformat(),
            }
        )
        
        saved_files.append(('upper', file_path))
        file_registries.append(file_registry)
    
    # Save lower scan if provided  
    if lower_file:
        filename = f"ios_lower_scanpair_{scanpair.scanpair_id}_patient_{scanpair.patient.patient_id}.stl"
        file_path = os.path.join(DATASET_DIRS['ios'], filename)
        
        with open(file_path, 'wb+') as destination:
            for chunk in lower_file.chunks():
                destination.write(chunk)
        
        file_hash = calculate_file_hash(file_path)
        file_size = os.path.getsize(file_path)
        
        file_registry = FileRegistry.objects.create(
            file_type='ios_raw_lower',
            file_path=file_path,
            file_size=file_size,
            file_hash=file_hash,
            scanpair=scanpair,
            metadata={
                'original_filename': lower_file.name,
                'uploaded_at': timezone.now().isoformat(),
            }
        )
        
        saved_files.append(('lower', file_path))
        file_registries.append(file_registry)
    
    # Create processing job if we have files
    processing_job = None
    if saved_files:
        input_files = {scan_type: path for scan_type, path in saved_files}
        
        processing_job = ProcessingJob.objects.create(
            job_type='ios',
            scanpair=scanpair,
            input_file_path=json.dumps(input_files),  # Store as JSON since we have multiple files
            docker_image='your-ios-processor:latest',  # Configure as needed
            docker_command=[
                '--scanpair-id', str(scanpair.scanpair_id),
                '--patient-id', str(scanpair.patient.patient_id),
                '--input-files', json.dumps(input_files),
                '--output-dir', PROCESSED_DIRS['ios']
            ]
        )
    
    return {
        'files': saved_files,
        'file_registries': file_registries,
        'processing_job': processing_job
    }


def save_audio_to_dataset(voice_caption, audio_file):
    """
    Save audio file to /dataset/raw/audio/ and create processing job
    
    Args:
        voice_caption: VoiceCaption instance
        audio_file: Django UploadedFile instance
        
    Returns:
        tuple: (file_path, processing_job)
    """
    ensure_directories()
    
    # Generate filename: audio_voice_{id}_scanpair_{scanpair_id}.webm
    original_name = audio_file.name
    extension = Path(original_name).suffix or '.webm'
    filename = f"audio_voice_{voice_caption.id}_scanpair_{voice_caption.scanpair.scanpair_id}{extension}"
    file_path = os.path.join(DATASET_DIRS['audio'], filename)
    
    # Save file to dataset directory
    with open(file_path, 'wb+') as destination:
        for chunk in audio_file.chunks():
            destination.write(chunk)
    
    # Calculate file hash and size
    file_hash = calculate_file_hash(file_path)
    file_size = os.path.getsize(file_path)
    
    # Create file registry entry
    file_registry = FileRegistry.objects.create(
        file_type='audio_raw',
        file_path=file_path,
        file_size=file_size,
        file_hash=file_hash,
        voice_caption=voice_caption,
        scanpair=voice_caption.scanpair,
        metadata={
            'original_filename': original_name,
            'duration': voice_caption.duration,
            'modality': voice_caption.modality,
            'uploaded_at': timezone.now().isoformat(),
        }
    )
    
    # Create processing job
    processing_job = ProcessingJob.objects.create(
        job_type='audio',
        voice_caption=voice_caption,
        scanpair=voice_caption.scanpair,
        input_file_path=file_path,
        docker_image='your-speech-to-text:latest',  # Configure as needed
        docker_command=[
            '--voice-caption-id', str(voice_caption.id),
            '--audio-file', file_path,
            '--output-dir', PROCESSED_DIRS['audio'],
            '--language', 'en',
            '--model', 'base'
        ]
    )
    
    return file_path, processing_job


def get_pending_jobs_for_type(job_type):
    """
    Get pending processing jobs for a specific type.
    This is what the external Docker containers will call.
    
    Args:
        job_type: 'cbct', 'ios', or 'audio'
        
    Returns:
        QuerySet of ProcessingJob objects
    """
    return ProcessingJob.objects.filter(
        job_type=job_type,
        status__in=['pending', 'retrying']
    ).order_by('-priority', 'created_at')


def mark_job_completed(job_id, output_files, logs=None):
    """
    Mark a processing job as completed and register output files.
    This is what the external Docker containers will call.
    
    Args:
        job_id: ProcessingJob ID
        output_files: dict of output file paths
        logs: optional processing logs
    """
    try:
        job = ProcessingJob.objects.get(id=job_id)
        job.mark_completed(output_files)
        
        # Register output files
        for file_type, file_path in output_files.items():
            if os.path.exists(file_path):
                file_hash = calculate_file_hash(file_path)
                file_size = os.path.getsize(file_path)
                
                # Determine file registry type based on job type
                registry_type_map = {
                    'cbct': 'cbct_processed',
                    'ios': f'ios_processed_{file_type}',  # file_type could be 'upper' or 'lower'
                    'audio': 'audio_processed'
                }
                
                registry_type = registry_type_map.get(job.job_type)
                
                FileRegistry.objects.create(
                    file_type=registry_type,
                    file_path=file_path,
                    file_size=file_size,
                    file_hash=file_hash,
                    scanpair=job.scanpair,
                    voice_caption=job.voice_caption,
                    processing_job=job,
                    metadata={
                        'processed_at': timezone.now().isoformat(),
                        'logs': logs if logs else ''
                    }
                )
        
        # Update related model status
        if job.scanpair and job.job_type == 'cbct':
            job.scanpair.cbct_processing_status = 'processed'
            job.scanpair.save()
        elif job.scanpair and job.job_type == 'ios':
            job.scanpair.ios_processing_status = 'processed'
            job.scanpair.save()
        elif job.voice_caption and job.job_type == 'audio':
            job.voice_caption.processing_status = 'completed'
            # Extract text from output files if available
            for file_path in output_files.values():
                if file_path.endswith('.txt'):
                    try:
                        with open(file_path, 'r', encoding='utf-8') as f:
                            job.voice_caption.text_caption = f.read()
                    except:
                        pass
            job.voice_caption.save()
            
        return True
        
    except ProcessingJob.DoesNotExist:
        return False


def mark_job_failed(job_id, error_msg, can_retry=True):
    """
    Mark a processing job as failed.
    This is what the external Docker containers will call.
    
    Args:
        job_id: ProcessingJob ID
        error_msg: Error message
        can_retry: Whether the job can be retried
    """
    try:
        job = ProcessingJob.objects.get(id=job_id)
        job.mark_failed(error_msg, can_retry)
        
        # Update related model status
        if job.scanpair and job.job_type == 'cbct':
            job.scanpair.cbct_processing_status = 'failed'
            job.scanpair.save()
        elif job.scanpair and job.job_type == 'ios':
            job.scanpair.ios_processing_status = 'failed'
            job.scanpair.save()
        elif job.voice_caption and job.job_type == 'audio':
            job.voice_caption.processing_status = 'failed'
            job.voice_caption.save()
            
        return True
        
    except ProcessingJob.DoesNotExist:
        return False 