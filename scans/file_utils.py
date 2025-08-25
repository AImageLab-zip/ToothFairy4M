import os
import shutil
import hashlib
import logging
import traceback
from pathlib import Path
from django.conf import settings
from django.utils import timezone
from .models import FileRegistry, ProcessingJob, VoiceCaption, Classification
import json
import zipfile
import tarfile

# Get logger for this module
logger = logging.getLogger(__name__)


# Base directories
from django.conf import settings
DATASET_ROOT = settings.DATASET_PATH

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
    'bite_classification': f"{DATASET_ROOT}/processed/bite",
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
    Supports multiple formats: DICOM, NIfTI, MetaImage, NRRD
    
    Args:
        scanpair: ScanPair instance
        cbct_file: Django UploadedFile instance
        
    Returns:
        tuple: (file_path, processing_job)
    """
    ensure_directories()
    
    original_name = cbct_file.name
    filename_lower = original_name.lower()
    if filename_lower.endswith('.nii.gz'):
        extension = '.nii.gz'
        file_format = 'nifti_compressed'
    elif filename_lower.endswith('.nii'):
        extension = '.nii'
        file_format = 'nifti'
    elif filename_lower.endswith(('.dcm', '.dicom')):
        extension = '.dcm'
        file_format = 'dicom_single'
    elif filename_lower == 'dicomdir' or filename_lower.endswith('/dicomdir'):
        extension = ''
        file_format = 'dicomdir'
    elif filename_lower.endswith('.mha'):
        extension = '.mha'
        file_format = 'metaimage'
    elif filename_lower.endswith('.mhd'):
        extension = '.mhd'
        file_format = 'metaimage_header'
    elif filename_lower.endswith('.nrrd'):
        extension = '.nrrd'
        file_format = 'nrrd'
    elif filename_lower.endswith('.nhdr'):
        extension = '.nhdr'
        file_format = 'nrrd_header'
    elif filename_lower.endswith('.zip'):
        extension = '.zip'
        file_format = 'dicom_archive_zip'
    elif filename_lower.endswith(('.tar', '.tar.gz', '.tgz')):
        if filename_lower.endswith('.tar.gz'):
            extension = '.tar.gz'
        elif filename_lower.endswith('.tgz'):
            extension = '.tgz'
        else:
            extension = '.tar'
        file_format = 'dicom_archive_tar'
    else:
        # Fallback - treat as raw DICOM
        extension = os.path.splitext(original_name)[1] or '.dcm'
        file_format = 'unknown'
    
    # Generate filename preserving original extension
    base_filename = f"cbct_scanpair_{scanpair.scanpair_id}_patient_{scanpair.patient.patient_id}"
    if extension == '':  # Special case for DICOMDIR
        filename = 'DICOMDIR'
        file_path = os.path.join(DATASET_DIRS['cbct'], f"{base_filename}_DICOMDIR")
    else:
        filename = f"{base_filename}{extension}"
        file_path = os.path.join(DATASET_DIRS['cbct'], filename)
    
    # Clean up existing CBCT files and registry entries for this scanpair
    existing_raw_files = FileRegistry.objects.filter(
        scanpair=scanpair,
        file_type='cbct_raw'
    )
    for existing_file in existing_raw_files:
        # Delete the physical file if it exists
        if os.path.exists(existing_file.file_path):
            try:
                os.remove(existing_file.file_path)
            except OSError as e:
                logger.warning(f"Could not delete existing CBCT file {existing_file.file_path}: {e}")
        # Delete the registry entry
        existing_file.delete()
    
    # Also clean up any existing processed CBCT files
    existing_processed_files = FileRegistry.objects.filter(
        scanpair=scanpair,
        file_type='cbct_processed'
    )
    for existing_file in existing_processed_files:
        # Delete the physical file if it exists
        if os.path.exists(existing_file.file_path):
            try:
                os.remove(existing_file.file_path)
            except OSError as e:
                logger.warning(f"Could not delete existing processed CBCT file {existing_file.file_path}: {e}")
        # Delete the registry entry
        existing_file.delete()
    
    # Save file to dataset directory
    with open(file_path, 'wb+') as destination:
        for chunk in cbct_file.chunks():
            destination.write(chunk)
    
    # Calculate file hash and size
    file_hash = calculate_file_hash(file_path)
    file_size = os.path.getsize(file_path)
    
    # Create file registry entry with format metadata
    file_registry = FileRegistry.objects.create(
        file_type='cbct_raw',
        file_path=file_path,
        file_size=file_size,
        file_hash=file_hash,
        scanpair=scanpair,
        metadata={
            'original_filename': original_name,
            'uploaded_at': timezone.now().isoformat(),
            'file_format': file_format,
            'needs_conversion': file_format != 'nifti_compressed',
        }
    )
    
    # Create processing job with conversion parameters
    processing_job = ProcessingJob.objects.create(
        job_type='cbct',
        scanpair=scanpair,
        input_file_path=file_path,
        docker_image='your-cbct-processor:latest',  # Configure as needed
        docker_command=[
            '--scanpair-id', str(scanpair.scanpair_id),
            '--patient-id', str(scanpair.patient.patient_id),
            '--input-file', file_path,
            '--input-format', file_format,  # Pass format to processing job
            '--output-dir', PROCESSED_DIRS['cbct'],
            '--convert-to-nifti',  # Flag to indicate conversion needed
        ],
        output_files={
            'input_format': file_format,
            'expected_outputs': [
                'volume_nifti',
                'panoramic_view',
                'structures_mesh',
            ]
        }
    )
    
    return file_path, processing_job


def save_cbct_folder_to_dataset(scanpair, folder_files):
    """
    Save CBCT folder (multiple DICOM files) to /dataset/raw/cbct/ and create processing job
    
    Args:
        scanpair: ScanPair instance
        folder_files: List of Django UploadedFile instances from folder
        
    Returns:
        tuple: (folder_path, processing_job)
    """
    from .models import validate_cbct_folder
    
    ensure_directories()
    
    # Validate folder contents
    valid_files = validate_cbct_folder(folder_files)
    
    # Create a folder for this CBCT dataset
    base_filename = f"cbct_scanpair_{scanpair.scanpair_id}_patient_{scanpair.patient.patient_id}_folder"
    folder_path = os.path.join(DATASET_DIRS['cbct'], base_filename)
    
    # Clean up existing CBCT files and registry entries for this scanpair
    existing_raw_files = FileRegistry.objects.filter(
        scanpair=scanpair,
        file_type='cbct_raw'
    )
    for existing_file in existing_raw_files:
        # Delete the physical file/folder if it exists
        if os.path.exists(existing_file.file_path):
            try:
                if os.path.isdir(existing_file.file_path):
                    shutil.rmtree(existing_file.file_path)
                else:
                    os.remove(existing_file.file_path)
            except OSError as e:
                logger.warning(f"Could not delete existing CBCT file/folder {existing_file.file_path}: {e}")
        # Delete the registry entry
        existing_file.delete()
    
    # Also clean up any existing processed CBCT files
    existing_processed_files = FileRegistry.objects.filter(
        scanpair=scanpair,
        file_type='cbct_processed'
    )
    for existing_file in existing_processed_files:
        # Delete the physical file if it exists
        if os.path.exists(existing_file.file_path):
            try:
                os.remove(existing_file.file_path)
            except OSError as e:
                logger.warning(f"Could not delete existing processed CBCT file {existing_file.file_path}: {e}")
        # Delete the registry entry
        existing_file.delete()
    
    # Create the new folder
    os.makedirs(folder_path, exist_ok=True)
    
    # Save all valid files to the folder
    saved_files = []
    total_size = 0
    
    for file in valid_files:
        # Preserve original filename
        file_path = os.path.join(folder_path, file.name)
        
        # Create subdirectories if needed (preserve folder structure)
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
        
        # Save file
        with open(file_path, 'wb+') as destination:
            for chunk in file.chunks():
                destination.write(chunk)
        
        file_size = os.path.getsize(file_path)
        file_hash = calculate_file_hash(file_path)
        total_size += file_size
        
        saved_files.append({
            'name': file.name,
            'path': file_path,
            'size': file_size,
            'hash': file_hash
        })
    
    # Calculate folder hash (hash of all file hashes combined)
    combined_hashes = ''.join(f['hash'] for f in saved_files)
    hash_sha256 = hashlib.sha256()
    hash_sha256.update(combined_hashes.encode())
    folder_hash = hash_sha256.hexdigest()
    
    # Create file registry entry for the folder
    file_registry = FileRegistry.objects.create(
        file_type='cbct_raw',
        file_path=folder_path,  # Path to folder
        file_size=total_size,
        file_hash=folder_hash,
        scanpair=scanpair,
        metadata={
            'upload_type': 'folder',
            'file_format': 'dicom_folder',
            'uploaded_at': timezone.now().isoformat(),
            'files': saved_files,  # List of all files in folder
            'needs_conversion': True,
        }
    )
    
    # Create processing job
    processing_job = ProcessingJob.objects.create(
        job_type='cbct',
        scanpair=scanpair,
        input_file_path=folder_path,  # Pass folder path
        docker_image='your-cbct-processor:latest',
        docker_command=[
            '--scanpair-id', str(scanpair.scanpair_id),
            '--patient-id', str(scanpair.patient.patient_id),
            '--input-folder', folder_path,  # Use folder flag
            '--input-format', 'dicom_folder',
            '--output-dir', PROCESSED_DIRS['cbct'],
            '--convert-to-nifti',
        ],
        output_files={
            'input_format': 'dicom_folder',
            'input_type': 'folder',
            'file_count': len(saved_files),
            'expected_outputs': [
                'volume_nifti',
                'panoramic_view',
                'structures_mesh',
            ]
        }
    )
    
    return folder_path, processing_job


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
    
    # Clean up existing IOS files and registry entries for this scanpair
    existing_ios_files = FileRegistry.objects.filter(
        scanpair=scanpair,
        file_type__in=['ios_raw_upper', 'ios_raw_lower', 'ios_processed_upper', 'ios_processed_lower']
    )
    for existing_file in existing_ios_files:
        # Delete the physical file if it exists
        if os.path.exists(existing_file.file_path):
            try:
                os.remove(existing_file.file_path)
            except OSError as e:
                logger.warning(f"Could not delete existing IOS file {existing_file.file_path}: {e}")
        # Delete the registry entry
        existing_file.delete()
    
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
    bite_classification_job = None
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
        
        # Need to double check this, i think we can be sure 100% that it does not exists, but what about
        # when we rerun some jobs? Is this always true? We should delete it and create a new one?
        existing_bite_job = ProcessingJob.objects.filter(
            scanpair=scanpair,
            job_type='bite_classification'
        ).first()
        
        if existing_bite_job:
            existing_bite_job.add_dependency(processing_job)
            
            current_output_files = existing_bite_job.output_files or {}
            current_output_files['depends_on_ios_job'] = processing_job.id
            current_output_files['ios_job_id'] = processing_job.id
            existing_bite_job.output_files = current_output_files
            existing_bite_job.save()
            
            bite_classification_job = existing_bite_job
            print(f"Updated existing bite classification job #{existing_bite_job.id} with dependency on IOS job #{processing_job.id}")
        else:
            bite_classification_job = ProcessingJob.objects.create(
                job_type='bite_classification',
                status='dependency',
                scanpair=scanpair,
                input_file_path=f"Waiting for IOS Job #{processing_job.id} to complete",  # Will be updated when IOS job completes
                docker_image='bite-classification:latest',
                docker_command=['python', 'classify_bite.py'],
                priority=processing_job.priority,
                output_files={
                    'output_dir': PROCESSED_DIRS['bite_classification'],
                    'expected_outputs': ['*_bite_classification_results.json'],
                    'depends_on_ios_job': processing_job.id,
                    'ios_job_id': processing_job.id
                }
            )
            bite_classification_job.add_dependency(processing_job)
            
            print(f"Created bite classification job #{bite_classification_job.id} with dependency on IOS job #{processing_job.id}")
    
    return {
        'files': saved_files,
        'file_registries': file_registries,
        'processing_job': processing_job,
        'bite_classification_job': bite_classification_job
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
        job_type: Any valid job type from ProcessingJob.JOB_TYPE_CHOICES
        
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
    logger.info(f"mark_job_completed called with job_id={job_id}, output_files={output_files}, logs present={logs is not None}")
    
    try:
        job = ProcessingJob.objects.get(id=job_id)
        logger.info(f"Found job: {job.id}, type: {job.job_type}, status: {job.status}")
        
        job.mark_completed(output_files)
        logger.info(f"Job marked as completed successfully")
        
        # Register output files
        logger.info(f"Registering output files for job type: {job.job_type}")
        
        if job.job_type == 'cbct':
            # For CBCT, we expect multiple output files
            # output_files should contain: pano, volume_nifti, structures_mesh_*, etc.
            processed_files = {}
            total_size = 0
            
            # Clean up any existing processed CBCT files for this scanpair
            existing_processed_files = FileRegistry.objects.filter(
                scanpair=job.scanpair,
                file_type='cbct_processed'
            )
            for existing_file in existing_processed_files:
                # Delete the physical file if it exists
                if os.path.exists(existing_file.file_path):
                    try:
                        os.remove(existing_file.file_path)
                    except OSError as e:
                        logger.warning(f"Could not delete existing processed CBCT file {existing_file.file_path}: {e}")
                # Delete the registry entry
                existing_file.delete()
            
            for file_type, file_path in output_files.items():
                logger.info(f"Processing CBCT output: type={file_type}, path={file_path}")
                if os.path.exists(file_path):
                    file_hash = calculate_file_hash(file_path)
                    file_size = os.path.getsize(file_path)
                    total_size += file_size
                    
                    processed_files[file_type] = {
                        'path': file_path,
                        'size': file_size,
                        'hash': file_hash,
                        'type': file_type
                    }
                else:
                    logger.warning(f"Output file not found: {file_path}")
            
            # Create single FileRegistry entry for CBCT with all outputs in metadata
            if processed_files:
                # Use pano path as primary file path (for backward compatibility)
                primary_path = processed_files.get('panoramic_view', {}).get('path', '')
                if not primary_path and processed_files:
                    # Fallback to first available file
                    primary_path = list(processed_files.values())[0]['path']
                
                FileRegistry.objects.create(
                    file_type='cbct_processed',
                    file_path=primary_path,  # Primary file path (e.g., pano)
                    file_size=total_size,  # Total size of all files
                    file_hash='multi-file',  # Indicator that this contains multiple files
                    scanpair=job.scanpair,
                    processing_job=job,
                    metadata={
                        'processed_at': timezone.now().isoformat(),
                        'files': processed_files,  # All output files stored here
                        'logs': logs if logs else ''
                    }
                )
                logger.info(f"CBCT FileRegistry entry created with {len(processed_files)} output files")
        
        else:
            # For IOS and audio, use the original single-file approach
            for file_type, file_path in output_files.items():
                logger.info(f"Processing output file: type={file_type}, path={file_path}")
                if os.path.exists(file_path):
                    logger.info(f"File exists, calculating hash and size")
                    file_hash = calculate_file_hash(file_path)
                    file_size = os.path.getsize(file_path)
                    
                    # Determine file registry type based on job type
                    registry_type_map = {
                        'ios': f'ios_processed_{file_type}',  # file_type could be 'upper' or 'lower'
                        'audio': 'audio_processed',
                        'bite_classification': 'bite_classification'
                    }
                    
                    registry_type = registry_type_map.get(job.job_type)
                    logger.info(f"Creating FileRegistry entry with type={registry_type}")
                    
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
                    logger.info(f"FileRegistry entry created successfully")
        
        # Update related model status
        logger.info(f"Updating related model status for job type: {job.job_type}")
        if job.scanpair and job.job_type == 'cbct':
            logger.info(f"Updating scanpair CBCT processing status")
            job.scanpair.cbct_processing_status = 'processed'
            job.scanpair.save()
        elif job.scanpair and job.job_type == 'ios':
            logger.info(f"Updating scanpair IOS processing status")
            job.scanpair.ios_processing_status = 'processed'
            job.scanpair.save()
            
            # Update bite classification jobs that depend on this IOS job
            try:
                dependent_bite_jobs = job.dependent_jobs.filter(job_type='bite_classification')
                for bite_job in dependent_bite_jobs:
                    if output_files:
                        bite_job.input_file_path = json.dumps(output_files)
                        bite_job.save()
                        logger.info(f"Updated bite classification job #{bite_job.id} with IOS output files: {list(output_files.keys())}")
                    else:
                        logger.warning(f"No output files found for IOS job #{job.id}, cannot update bite classification job #{bite_job.id}")
            except Exception as e:
                logger.error(f"Error updating dependent bite classification jobs: {e}")
        elif job.voice_caption and job.job_type == 'audio':
            
            job.voice_caption.processing_status = 'completed'
            
            # Use logs parameter directly if it contains transcription text
            if logs and isinstance(logs, str) and logs.strip():
                job.voice_caption.text_caption = logs.strip()
                logger.info(f"Successfully saved transcription from logs: {logs[:50]}...")
            else:
                logger.warning(f"Logs parameter is empty or invalid: {logs}")
                # Fallback: try to extract text from output files if available
                text_extracted = False
                for file_path in output_files.values():
                    if file_path.endswith('.txt'):
                        try:
                            with open(file_path, 'r', encoding='utf-8') as f:
                                text_content = f.read().strip()
                                if text_content:  # Only update if we got actual text
                                    job.voice_caption.text_caption = text_content
                                    text_extracted = True
                                    logger.info(f"Successfully extracted text from {file_path}: {text_content[:50]}...")
                                else:
                                    logger.warning(f"Text file {file_path} is empty")
                        except Exception as e:
                            logger.error(f"Error reading text file {file_path}: {e}")
                
                if not text_extracted:
                    logger.warning(f"No text was extracted for voice caption {job.voice_caption.id}")
                    # Set a placeholder text to indicate processing completed but no text found
                    job.voice_caption.text_caption = ""
            
            job.voice_caption.save()
            
        elif job.scanpair and job.job_type == 'bite_classification':
            logger.info(f"Bite classification job completed for scanpair {job.scanpair.scanpair_id}")
            
            try:
                classification_file = None
                for file_type, file_path in output_files.items():
                    if (file_path.endswith('_bite_classification_results.json') or 
                        'bite_classification' in file_type.lower() or
                        'classification' in file_type.lower()):
                        classification_file = file_path
                        break
                
                if classification_file and os.path.exists(classification_file):
                    logger.info(f"Found classification file: {classification_file}")
                    
                    with open(classification_file, 'r', encoding='utf-8') as f:
                        classification_data = json.loads(f.read())
                    
                    sagittal_left = classification_data.get('sagittal_left', 'Unknown')
                    sagittal_right = classification_data.get('sagittal_right', 'Unknown')
                    vertical = classification_data.get('vertical', 'Unknown')
                    transverse = classification_data.get('transverse', 'Unknown')
                    midline = classification_data.get('midline', 'Unknown')
                    
                    if any(val != 'Unknown' for val in [sagittal_left, sagittal_right, vertical, transverse, midline]):
                        classification, created = Classification.objects.get_or_create(
                            scanpair=job.scanpair,
                            classifier='pipeline',
                            defaults={
                                'sagittal_left': sagittal_left,
                                'sagittal_right': sagittal_right,
                                'vertical': vertical,
                                'transverse': transverse,
                                'midline': midline,
                                'annotator': None,
                            }
                        )
                        
                        if not created:
                            classification.sagittal_left = sagittal_left
                            classification.sagittal_right = sagittal_right
                            classification.vertical = vertical
                            classification.transverse = transverse
                            classification.midline = midline
                            classification.save()
                        
                        logger.info(f"{'Created' if created else 'Updated'} classification for scanpair {job.scanpair.scanpair_id}")
                        
                        file_hash = calculate_file_hash(classification_file)
                        file_size = os.path.getsize(classification_file)
                        
                        FileRegistry.objects.create(
                            file_type='bite_classification',
                            file_path=classification_file,
                            file_size=file_size,
                            file_hash=file_hash,
                            scanpair=job.scanpair,
                            processing_job=job,
                            metadata={
                                'processed_at': timezone.now().isoformat(),
                                'classification_results': classification_data,
                                'logs': logs if logs else ''
                            }
                        )
                        
                        logger.info(f"Stored classification file in FileRegistry")
                    else:
                        logger.warning(f"Classification file contains no valid classification data: {classification_data}")
                        
                else:
                    logger.warning(f"No classification file found in output files: {output_files}")
                    
            except Exception as e:
                logger.error(f"Error processing bite classification completion for scanpair {job.scanpair.scanpair_id}: {e}")
                logger.error(f"Full traceback: {traceback.format_exc()}")
            
        logger.info(f"mark_job_completed completed successfully")
        return True
        
    except ProcessingJob.DoesNotExist:
        logger.error(f"ProcessingJob with ID {job_id} does not exist")
        return False
    except Exception as e:
        logger.error(f"Error in mark_job_completed for job_id={job_id}: {e}")
        logger.error(f"Full traceback: {traceback.format_exc()}")
        raise


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
        
        if job.scanpair and job.job_type == 'cbct':
            job.scanpair.cbct_processing_status = 'failed'
            job.scanpair.save()
        elif job.scanpair and job.job_type == 'ios':
            job.scanpair.ios_processing_status = 'failed'
            job.scanpair.save()
        elif job.voice_caption and job.job_type == 'audio':
            job.voice_caption.processing_status = 'failed'
            job.voice_caption.save()
        elif job.scanpair and job.job_type == 'bite_classification':
            logger.info(f"Bite classification job failed for scanpair {job.scanpair.scanpair_id}")
            
        return True
        
    except ProcessingJob.DoesNotExist:
        return False 