import os
import shutil
import hashlib
import logging
import traceback
from pathlib import Path
from django.utils import timezone
from django.utils.text import slugify
from common.models import FileRegistry, Job
from .models import VoiceCaption, Classification, Patient
from common.models import Project
import json
import zipfile
import tarfile

# Get logger for this module
logger = logging.getLogger(__name__)


from django.conf import settings
DATASET_ROOT = settings.DATASET_PATH


def get_file_type_for_modality(modality_slug, is_processed=False, file_format=None, subtype=None):
    """
    Centralized function to determine the correct file_type for a given modality.
    
    Args:
        modality_slug: The modality slug (e.g., 'cbct', 'ios', 'braintumor-mri-t1')
        is_processed: Whether this is a processed file (adds _processed suffix)
        file_format: Optional file format hint for fallback logic
        subtype: Optional subtype (e.g., 'upper', 'lower' for IOS)
    
    Returns:
        str: The file_type to use in FileRegistry
    """
    from common.models import FileRegistry
    
    if not modality_slug:
        return 'generic_processed' if is_processed else 'generic_raw'
    
    # Special handling for IOS with subtypes
    if modality_slug == 'ios' and subtype:
        base_type = f'ios_{subtype}'
        file_type = f'{base_type}_processed' if is_processed else f'{base_type}_raw'
        valid_file_types = FileRegistry.get_file_type_choices_dict().keys()
        if file_type in valid_file_types:
            return file_type
    
    # Convert modality slug to file_type by replacing hyphens with underscores
    base_modality = modality_slug.replace('-', '_')
    suffix = '_processed' if is_processed else '_raw'
    potential_file_type = base_modality + suffix
    
    # Check if this file_type exists in our choices
    valid_file_types = FileRegistry.get_file_type_choices_dict().keys()
    
    if potential_file_type in valid_file_types:
        return potential_file_type
    
    # Fallback mappings for special cases
    fallback_mappings = {
        'cbct': 'cbct_raw' if not is_processed else 'cbct_processed',
        'ios': 'cbct_raw' if not is_processed else 'cbct_processed',  # Keep existing behavior
        'audio': 'audio_raw' if not is_processed else 'audio_processed',
        'bite_classification': 'bite_classification',  # Special case - no raw/processed distinction
        'intraoral': 'intraoral_raw' if not is_processed else 'intraoral_processed',
        'teleradiography': 'teleradiography_raw' if not is_processed else 'teleradiography_processed',
        'panoramic': 'panoramic_raw' if not is_processed else 'panoramic_processed',
        'rawzip': 'generic_raw' if not is_processed else 'generic_processed',  # RawZip files use generic types
    }
    
    if modality_slug in fallback_mappings:
        return fallback_mappings[modality_slug]
    
    # File format-based fallbacks for unknown modalities
    if not is_processed and file_format:
        if file_format in ['nii', 'nii.gz', 'dicom', 'mha', 'mhd', 'nrrd']:
            return 'volume_raw'
        elif file_format in ['jpg', 'jpeg', 'png', 'bmp', 'tiff', 'tif']:
            return 'image_raw'
    
    # Final fallback
    return 'generic_processed' if is_processed else 'generic_raw'


def _get_patient(obj):
    """Resolve a Patient instance from various inputs (Patient, VoiceCaption with patient, legacy scanpair)."""
    if isinstance(obj, Patient):
        return obj
    if hasattr(obj, 'patient') and isinstance(getattr(obj, 'patient'), Patient):
        return getattr(obj, 'patient')
    # Legacy: scanpair with .patient relation
    if hasattr(obj, 'patient'):
        return getattr(obj, 'patient')
    raise ValueError('Cannot resolve Patient from object')


def _project_slug_from_patient(patient: Patient) -> str:
    project = getattr(patient, 'project', None)
    if not project or not isinstance(project, Project):
        return 'default'
    return getattr(project, 'slug', None) or slugify(getattr(project, 'name', 'default') or 'default')


def _raw_dir_for(patient: Patient, modality_slug: str) -> str:
    project_slug = _project_slug_from_patient(patient)
    return os.path.join(DATASET_ROOT, project_slug, 'raw', modality_slug)


def _processed_dir_for(patient: Patient, modality_slug: str) -> str:
    project_slug = _project_slug_from_patient(patient)
    return os.path.join(DATASET_ROOT, project_slug, 'processed', modality_slug)


def ensure_directories(paths: list[str]):
    """Ensure provided directories exist"""
    for dir_path in paths:
        os.makedirs(dir_path, exist_ok=True)


def calculate_file_hash(file_path):
    """Calculate SHA256 hash of a file"""
    hash_sha256 = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(4096), b""):
            hash_sha256.update(chunk)
    return hash_sha256.hexdigest()
def _detect_extension_and_format(filename_lower: str):
    if filename_lower.endswith('.nii.gz'):
        return '.nii.gz', 'nifti_compressed'
    if filename_lower.endswith('.nii'):
        return '.nii', 'nifti'
    if filename_lower.endswith(('.dcm', '.dicom')):
        return '.dcm', 'dicom_single'
    if filename_lower == 'dicomdir' or filename_lower.endswith('/dicomdir'):
        return '', 'dicomdir'
    if filename_lower.endswith('.mha'):
        return '.mha', 'metaimage'
    if filename_lower.endswith('.mhd'):
        return '.mhd', 'metaimage_header'
    if filename_lower.endswith('.nrrd'):
        return '.nrrd', 'nrrd'
    if filename_lower.endswith('.nhdr'):
        return '.nhdr', 'nrrd_header'
    if filename_lower.endswith('.zip'):
        return '.zip', 'dicom_archive_zip'
    if filename_lower.endswith(('.tar', '.tar.gz', '.tgz')):
        if filename_lower.endswith('.tar.gz'):
            return '.tar.gz', 'dicom_archive_tar'
        if filename_lower.endswith('.tgz'):
            return '.tgz', 'dicom_archive_tar'
        return '.tar', 'dicom_archive_tar'
    # Fallback
    return os.path.splitext(filename_lower)[1] or '.bin', 'unknown'


def save_generic_modality_file(patient: Patient, modality_slug: str, uploaded_file, job=False):
    """Save a single file for an arbitrary modality slug and create a Job.

    - Files go to /dataset/raw/<modality_slug>/
    - A FileRegistry entry is created with modality set, and subtype left blank
    - A Job is created with modality_slug and input_file_path
    """
    raw_dir = _raw_dir_for(patient, modality_slug)
    processed_dir = _processed_dir_for(patient, modality_slug)
    ensure_directories([raw_dir, processed_dir])
    original_name = uploaded_file.name
    extension, file_format = _detect_extension_and_format(original_name.lower())
    filename = f"{modality_slug}_patient_{patient.patient_id}{extension}"
    file_path = os.path.join(raw_dir, filename)
    with open(file_path, 'wb+') as destination:
        for chunk in uploaded_file.chunks():
            destination.write(chunk)
    file_hash = calculate_file_hash(file_path)
    file_size = os.path.getsize(file_path)
    # Resolve modality FK for FileRegistry
    modality_fk = None
    try:
        from common.models import Modality as _Modality
        modality_fk = _Modality.objects.filter(slug=modality_slug).first()
    except Exception:
        modality_fk = None
    # Determine appropriate file_type using centralized function
    file_type = get_file_type_for_modality(modality_slug, is_processed=False, file_format=file_format)
    
    try:
        fr = FileRegistry.objects.create(
            file_type=file_type,
            file_path=file_path,
            file_size=file_size,
            file_hash=file_hash,
            patient=patient,
            modality=modality_fk,
            metadata={
                'original_filename': original_name,
                'uploaded_at': timezone.now().isoformat(),
                'file_format': file_format,
                'modality_slug': modality_slug,
            }
        )
    except Exception:
        logger.exception("Failed to create FileRegistry for %s; proceeding to create Job anyway", modality_slug)
        fr = None
    
    # Create job (completed for image modalities that don't need processing)
    job_obj = None
    try:
        # Image modalities that don't need processing
        no_processing_modalities = ['panoramic', 'teleradiography', 'intraoral-photo', 'rawzip']
        
        if modality_slug in no_processing_modalities:
            # Create completed job
            job_obj = Job.objects.create(
                modality_slug=modality_slug,
                patient=patient,
                input_file_path=file_path,
                status='completed',
                output_files={
                    'input_format': file_format,
                    'file_path': file_path
                }
            )
            job_obj.started_at = timezone.now()
            job_obj.completed_at = timezone.now()
            job_obj.save()
        else:
            # Create pending job for modalities that need processing
            job_obj = Job.objects.create(
                modality_slug=modality_slug,
                patient=patient,
                input_file_path=file_path,
                status='pending',
                output_files={
                    'input_format': file_format,
                    'expected_outputs': []
                }
            )
    except Exception as e:
        logger.error(f"Failed to create Job for {modality_slug}: {e}")
    
    return fr, job_obj


def save_generic_modality_folder(patient: Patient, modality_slug: str, folder_files):
    """Save a folder upload for an arbitrary modality slug and create a Job.
    Similar to save_cbct_folder_to_dataset but generic and sets FileRegistry.modality.
    """
    raw_dir = _raw_dir_for(patient, modality_slug)
    processed_dir = _processed_dir_for(patient, modality_slug)
    ensure_directories([raw_dir, processed_dir])
    saved_files = []
    for f in folder_files:
        # Preserve relative filenames where possible
        base = os.path.basename(getattr(f, 'name', 'file'))
        dest = os.path.join(raw_dir, base)
        with open(dest, 'wb+') as destination:
            for chunk in f.chunks():
                destination.write(chunk)
        saved_files.append(dest)
    # Create one FileRegistry entry summarizing folder upload
    summary_path = os.path.join(raw_dir, f"{modality_slug}_patient_{patient.patient_id}_folder.txt")
    with open(summary_path, 'w') as s:
        s.write('\n'.join(saved_files[:50]))
    file_hash = calculate_file_hash(summary_path)
    file_size = os.path.getsize(summary_path)
    modality_fk = None
    try:
        from common.models import Modality as _Modality
        modality_fk = _Modality.objects.filter(slug=modality_slug).first()
    except Exception:
        modality_fk = None
    # Determine file_type for folder upload using centralized function
    folder_file_type = get_file_type_for_modality(modality_slug, is_processed=False)
    
    try:
        fr = FileRegistry.objects.create(
            file_type=folder_file_type,
            file_path=summary_path,
            file_size=file_size,
            file_hash=file_hash,
            patient=patient,
            modality=modality_fk,
            metadata={
                'uploaded_at': timezone.now().isoformat(),
                'input_type': 'folder',
                'file_count': len(saved_files),
                'modality_slug': modality_slug,
            }
        )
    except Exception:
        logger.exception("Failed to create FileRegistry (folder) for %s; proceeding to create Job anyway", modality_slug)
        fr = None
    job = Job.objects.create(
        modality_slug=modality_slug,
        patient=patient,
        input_file_path=summary_path,
        output_files={
            'input_type': 'folder',
            'file_count': len(saved_files),
            'expected_outputs': []
        }
    )
    return fr, job


def save_cbct_to_dataset(patient_or_legacy, cbct_file):
    """
    Save CBCT file to /dataset/raw/cbct/ and create processing job
    Supports multiple formats: DICOM, NIfTI, MetaImage, NRRD
    
    Args:
        patient_or_legacy: Patient or legacy object with .patient
        cbct_file: Django UploadedFile instance
        
    Returns:
        tuple: (file_path, processing_job)
    """
    patient = _get_patient(patient_or_legacy)
    raw_dir = _raw_dir_for(patient, 'cbct')
    processed_dir = _processed_dir_for(patient, 'cbct')
    ensure_directories([raw_dir, processed_dir])
    
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
    base_filename = f"cbct_patient_{patient.patient_id}"
    if extension == '':  # Special case for DICOMDIR
        filename = 'DICOMDIR'
        file_path = os.path.join(raw_dir, f"{base_filename}_DICOMDIR")
    else:
        filename = f"{base_filename}{extension}"
        file_path = os.path.join(raw_dir, filename)
    
    # Clean up existing CBCT files and registry entries for this patient
    cbct_raw_type = get_file_type_for_modality('cbct', is_processed=False)
    cbct_processed_type = get_file_type_for_modality('cbct', is_processed=True)
    existing_raw_files = FileRegistry.objects.filter(patient=patient, file_type=cbct_raw_type)
    
    # Also clean up any existing processed CBCT files
    existing_processed_files = FileRegistry.objects.filter(patient=patient, file_type=cbct_processed_type)
    
    # Save file to dataset directory
    with open(file_path, 'wb+') as destination:
        for chunk in cbct_file.chunks():
            destination.write(chunk)
    
    # Calculate file hash and size
    file_hash = calculate_file_hash(file_path)
    file_size = os.path.getsize(file_path)
    modality_fk = None
    try:
        from common.models import Modality as _Modality
        modality_fk = _Modality.objects.filter(slug='cbct').first()
    except Exception:
        modality_fk = None
    # Create file registry entry with format metadata
    file_registry = FileRegistry.objects.create(
        file_type=get_file_type_for_modality('cbct', is_processed=False),
        file_path=file_path,
        file_size=file_size,
        file_hash=file_hash,
        patient=patient,
        modality=modality_fk,
        metadata={
            'original_filename': original_name,
            'uploaded_at': timezone.now().isoformat(),
            'file_format': file_format,
            'needs_conversion': file_format != 'nifti_compressed',
        }
    )
    
    # Create job
    processing_job = Job.objects.create(
        modality_slug='cbct',
        patient=patient,
        input_file_path=file_path,
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


def save_cbct_folder_to_dataset(patient_or_legacy, folder_files):
    """
    Save CBCT folder (multiple DICOM files) to /dataset/raw/cbct/ and create processing job
    
    Args:
        patient_or_legacy: Patient or legacy object with .patient
        folder_files: List of Django UploadedFile instances from folder
        
    Returns:
        tuple: (folder_path, processing_job)
    """
    from .models import validate_cbct_folder
    
    patient = _get_patient(patient_or_legacy)
    raw_dir = _raw_dir_for(patient, 'cbct')
    processed_dir = _processed_dir_for(patient, 'cbct')
    ensure_directories([raw_dir, processed_dir])
    
    # Validate folder contents
    valid_files = validate_cbct_folder(folder_files)
    
    # Create a folder for this CBCT dataset
    base_filename = f"cbct_patient_{patient.patient_id}_folder"
    folder_path = os.path.join(raw_dir, base_filename)
    
    # Clean up existing CBCT files and registry entries for this patient
    cbct_raw_type = get_file_type_for_modality('cbct', is_processed=False)
    existing_raw_files = FileRegistry.objects.filter(patient=patient, file_type=cbct_raw_type)
    
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
        file_type=get_file_type_for_modality('cbct', is_processed=False),
        file_path=folder_path,  # Path to folder
        file_size=total_size,
        file_hash=folder_hash,
        patient=patient,
        metadata={
            'upload_type': 'folder',
            'file_format': 'dicom_folder',
            'uploaded_at': timezone.now().isoformat(),
            'files': saved_files,  # List of all files in folder
            'needs_conversion': True,
        }
    )
    
    # Create job
    processing_job = Job.objects.create(
        modality_slug='cbct',
        patient=patient,
        input_file_path=folder_path,  # Pass folder path
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


def save_ios_to_dataset(patient_or_legacy, upper_file=None, lower_file=None):
    """
    Save IOS files to /dataset/raw/ios/ and create processing job
    
    Args:
        patient_or_legacy: Patient or legacy object with .patient  
        upper_file: Django UploadedFile instance for upper scan
        lower_file: Django UploadedFile instance for lower scan
        
    Returns:
        dict: {'files': [...], 'processing_job': job}
    """
    patient = _get_patient(patient_or_legacy)
    raw_dir = _raw_dir_for(patient, 'ios')
    processed_dir = _processed_dir_for(patient, 'ios')
    bite_proc_dir = _processed_dir_for(patient, 'bite')
    ensure_directories([raw_dir, processed_dir, bite_proc_dir])
    
    saved_files = []
    file_registries = []
    
    # Save upper scan if provided
    if upper_file:
        filename = f"ios_upper_patient_{patient.patient_id}.stl"
        file_path = os.path.join(raw_dir, filename)
        
        with open(file_path, 'wb+') as destination:
            for chunk in upper_file.chunks():
                destination.write(chunk)
        
        file_hash = calculate_file_hash(file_path)
        file_size = os.path.getsize(file_path)
        modality_fk = None
        try:
            from common.models import Modality as _Modality
            modality_fk = _Modality.objects.filter(slug='ios').first()
        except Exception:
            modality_fk = None
        file_registry = FileRegistry.objects.create(
            file_type=get_file_type_for_modality('ios', is_processed=False, subtype='upper'),
            file_path=file_path,
            file_size=file_size,
            file_hash=file_hash,
            patient=patient,
            modality=modality_fk,
            metadata={
                'original_filename': upper_file.name,
                'uploaded_at': timezone.now().isoformat(),
            }
        )
        
        saved_files.append(('upper', file_path))
        file_registries.append(file_registry)
    
    # Save lower scan if provided  
    if lower_file:
        filename = f"ios_lower_patient_{patient.patient_id}.stl"
        file_path = os.path.join(raw_dir, filename)
        
        with open(file_path, 'wb+') as destination:
            for chunk in lower_file.chunks():
                destination.write(chunk)
        
        file_hash = calculate_file_hash(file_path)
        file_size = os.path.getsize(file_path)
        
        file_registry = FileRegistry.objects.create(
            file_type=get_file_type_for_modality('ios', is_processed=False, subtype='lower'),
            file_path=file_path,
            file_size=file_size,
            file_hash=file_hash,
            patient=patient,
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
        
        processing_job = Job.objects.create(
            modality_slug='ios',
            patient=patient,
            input_file_path=json.dumps(input_files)
        )
        
        # Need to double check this, i think we can be sure 100% that it does not exists, but what about
        # when we rerun some jobs? Is this always true? We should delete it and create a new one?
        existing_bite_job = Job.objects.filter(
            patient=patient,
            modality_slug='bite_classification'
        ).first()
        
        if existing_bite_job:
            existing_bite_job.add_dependency(processing_job)
            
            current_output_files = existing_bite_job.output_files or {}
            current_output_files['depends_on_ios_job'] = processing_job.id
            current_output_files['ios_job_id'] = processing_job.id
            existing_bite_job.output_files = current_output_files
            existing_bite_job.save()
            
            bite_classification_job = existing_bite_job
            logger.info(
                f"Updated existing bite classification job #{existing_bite_job.id} with dependency on IOS job #{processing_job.id}"
            )
        else:
            bite_classification_job = Job.objects.create(
                modality_slug='bite_classification',
                status='dependency',
                patient=patient,
                input_file_path=f"Waiting for IOS Job #{processing_job.id} to complete",
                priority=processing_job.priority,
                output_files={
                    'output_dir': bite_proc_dir,
                    'expected_outputs': ['*_bite_classification_results.json'],
                    'depends_on_ios_job': processing_job.id,
                    'ios_job_id': processing_job.id
                }
            )
            bite_classification_job.add_dependency(processing_job)
            
            logger.info(
                f"Created bite classification job #{bite_classification_job.id} with dependency on IOS job #{processing_job.id}"
            )
    
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
    patient = _get_patient(voice_caption)
    raw_dir = _raw_dir_for(patient, 'audio')
    processed_dir = _processed_dir_for(patient, 'audio')
    ensure_directories([raw_dir, processed_dir])
    
    # Generate filename: audio_voice_{id}_patient_{patient_id}.webm
    original_name = audio_file.name
    extension = Path(original_name).suffix or '.webm'
    filename = f"audio_voice_{voice_caption.id}_patient_{patient.patient_id}{extension}"
    file_path = os.path.join(raw_dir, filename)
    
    # Save file to dataset directory
    with open(file_path, 'wb+') as destination:
        for chunk in audio_file.chunks():
            destination.write(chunk)
    
    # Calculate file hash and size
    file_hash = calculate_file_hash(file_path)
    file_size = os.path.getsize(file_path)
    
    # Create file registry entry
    file_registry = FileRegistry.objects.create(
        file_type=get_file_type_for_modality('audio', is_processed=False),
        file_path=file_path,
        file_size=file_size,
        file_hash=file_hash,
        voice_caption=voice_caption,
        patient=patient,
        metadata={
            'original_filename': original_name,
            'duration': voice_caption.duration,
            'modality': voice_caption.modality,
            'uploaded_at': timezone.now().isoformat(),
        }
    )
    
    # Create processing job
    processing_job = Job.objects.create(
        modality_slug='audio',
        voice_caption=voice_caption,
        patient=patient,
        input_file_path=file_path,
    )
    
    return file_path, processing_job


def save_rgb_images_to_dataset(patient_or_legacy, images):
    """Save one or more RGB images for a patient to /dataset/raw/rgb/ and register them.

    Args:
        patient_or_legacy: Patient or legacy object with .patient
        images: iterable of UploadedFile

    Returns:
        tuple(list[FileRegistry], list[dict]): (saved_entries, errors)
    """
    patient = _get_patient(patient_or_legacy)
    raw_dir = _raw_dir_for(patient, 'rgb')
    ensure_directories([raw_dir])

    saved_entries = []
    errors = []

    for idx, img in enumerate(images):
        try:
            original_name = img.name
            name_lower = original_name.lower()
            # Accept common RGB formats
            valid_exts = ['.png', '.jpg', '.jpeg', '.bmp', '.tif', '.tiff', '.webp']
            ext = Path(original_name).suffix.lower()
            if ext not in valid_exts:
                # Try to infer via content-type if no/unknown extension
                ext = ext if ext else '.png'

            # Optionally parse a friendly label from field name; support (name,img) tuples
            label = getattr(img, 'label', '') or ''

            filename = f"rgb_{patient.patient_id}_{timezone.now().strftime('%Y%m%d_%H%M%S')}_{idx}{ext}"
            file_path = os.path.join(raw_dir, filename)

            with open(file_path, 'wb+') as destination:
                for chunk in img.chunks():
                    destination.write(chunk)

            file_hash = calculate_file_hash(file_path)
            file_size = os.path.getsize(file_path)

            entry = FileRegistry.objects.create(
                file_type=get_file_type_for_modality('rgb', is_processed=False, file_format=ext),
                file_path=file_path,
                file_size=file_size,
                file_hash=file_hash,
                patient=patient,
                metadata={
                    'original_filename': original_name,
                    'label': label,
                    'uploaded_at': timezone.now().isoformat(),
                }
            )
            saved_entries.append(entry)
        except Exception as e:
            logger.error(f"Error saving RGB image {getattr(img, 'name', '')}: {e}")
            errors.append({'name': getattr(img, 'name', ''), 'error': str(e)})

    return saved_entries, errors


def save_intraoral_photos_to_dataset(patient_or_legacy, images):
    """Save multiple intraoral images for a patient and create FileRegistry entries.
    Returns (saved_entries, errors, job) where saved_entries is a list of FileRegistry objects,
    errors is a list of error messages for failed uploads, and job is the processing job.
    """
    patient = _get_patient(patient_or_legacy)
    raw_dir = _raw_dir_for(patient, 'intraoral')
    processed_dir = _processed_dir_for(patient, 'intraoral')
    ensure_directories([raw_dir, processed_dir])
    
    saved_entries = []
    errors = []
    saved_files = []
    
    # Resolve modality FK for FileRegistry
    modality_fk = None
    try:
        from common.models import Modality as _Modality
        modality_fk = _Modality.objects.filter(slug='intraoral-photo').first()
    except Exception:
        pass
    
    for idx, img in enumerate(images):
        try:
            original_name = getattr(img, 'name', f'intraoral_{idx}.jpg')
            ext = os.path.splitext(original_name)[1].lower() or '.jpg'
            
            filename = f"intraoral_{idx + 1}_patient_{patient.patient_id}{ext}"
            file_path = os.path.join(raw_dir, filename)

            with open(file_path, 'wb+') as destination:
                for chunk in img.chunks():
                    destination.write(chunk)

            file_hash = calculate_file_hash(file_path)
            file_size = os.path.getsize(file_path)

            entry = FileRegistry.objects.create(
                file_type='intraoral_raw',  # Use legacy file_type for FileRegistry
                file_path=file_path,
                file_size=file_size,
                file_hash=file_hash,
                patient=patient,
                modality=modality_fk,
                metadata={
                    'original_filename': original_name,
                    'image_index': idx + 1,
                    'uploaded_at': timezone.now().isoformat(),
                }
            )
            saved_entries.append(entry)
            saved_files.append(file_path)
        except Exception as e:
            logger.error(f"Error saving intraoral image {idx}: {e}", exc_info=True)
            errors.append(f"Failed to save image {idx + 1}: {str(e)}")
    
    # Create completed job (intraoral photos don't need processing)
    job = None
    if saved_files:
        try:
            # Create a summary file listing all uploaded images
            summary_path = os.path.join(raw_dir, f"intraoral_patient_{patient.patient_id}_summary.txt")
            with open(summary_path, 'w') as f:
                f.write('\n'.join(saved_files))
            
            job = Job.objects.create(
                modality_slug='intraoral-photo',
                patient=patient,
                input_file_path=summary_path,
                status='completed',
                output_files={
                    'input_type': 'multiple_images',
                    'file_count': len(saved_files),
                    'files': saved_files
                }
            )
            job.started_at = timezone.now()
            job.completed_at = timezone.now()
            job.save()
        except Exception as e:
            logger.error(f"Error creating intraoral job: {e}", exc_info=True)
    
    return saved_entries, errors, job

def get_pending_jobs_for_type(job_type):
    """
    Get pending processing jobs for a specific type.
    This is what the external Docker containers will call.
    
    Args:
        job_type: Any valid job type from ProcessingJob.JOB_TYPE_CHOICES
        
    Returns:
        QuerySet of ProcessingJob objects
    """
    # job_type corresponds to modality_slug now
    return Job.objects.filter(
        modality_slug=job_type,
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
        job = Job.objects.get(id=job_id)
        logger.info(f"Found job: {job.id}, modality: {job.modality_slug}, status: {job.status}")
        
        job.mark_completed(output_files)
        logger.info(f"Job marked as completed successfully")
        
        # Register output files
        logger.info(f"Registering output files for modality: {job.modality_slug}")
        
        if job.modality_slug == 'cbct':
            # For CBCT, we expect multiple output files
            # output_files should contain: pano, volume_nifti, structures_mesh_*, etc.
            processed_files = {}
            total_size = 0
            
            # Clean up any existing processed CBCT files for this patient
            cbct_processed_type = get_file_type_for_modality('cbct', is_processed=True)
            existing_processed_files = FileRegistry.objects.filter(
                patient=job.patient,
                file_type=cbct_processed_type
            )
            # Remove existing DB entries only; keep files on disk
            try:
                existing_count = existing_processed_files.count()
                if existing_count:
                    logger.info(f"Deleting {existing_count} existing {cbct_processed_type} FileRegistry entries for patient {getattr(job.patient, 'patient_id', 'unknown')}")
                    existing_processed_files.delete()
            except Exception as e:
                logger.error(f"Error deleting existing {cbct_processed_type} FileRegistry entries: {e}")
            
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
                    file_type=get_file_type_for_modality('cbct', is_processed=True),
                    file_path=primary_path,  # Primary file path (e.g., pano)
                    file_size=total_size,  # Total size of all files
                    file_hash='multi-file',  # Indicator that this contains multiple files
                    patient=job.patient,
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
                    # Remove existing DB entry for this file_path (keep file on disk)
                    try:
                        deleted, _ = FileRegistry.objects.filter(file_path=file_path).delete()
                        if deleted:
                            logger.info(f"Deleted existing FileRegistry entry for path={file_path}")
                    except Exception as e:
                        logger.error(f"Error deleting existing FileRegistry entry for path={file_path}: {e}")
                    logger.info(f"File exists, calculating hash and size")
                    file_hash = calculate_file_hash(file_path)
                    file_size = os.path.getsize(file_path)
                    
                    # Determine file registry type using centralized function
                    if job.modality_slug == 'ios':
                        # IOS has special subtype handling for upper/lower
                        registry_type = f'ios_processed_{file_type}'
                    else:
                        # Use centralized function for all other modalities
                        registry_type = get_file_type_for_modality(job.modality_slug, is_processed=True)
                    logger.info(f"Creating FileRegistry entry with type={registry_type}")
                    
                    FileRegistry.objects.create(
                        file_type=registry_type,
                        file_path=file_path,
                        file_size=file_size,
                        file_hash=file_hash,
                        patient=job.patient,
                        voice_caption=job.voice_caption,
                        processing_job=job,
                        metadata={
                            'processed_at': timezone.now().isoformat(),
                            'logs': logs if logs else ''
                        }
                    )
                    logger.info(f"FileRegistry entry created successfully")
        
        # Update related model status
        logger.info(f"Updating related model status for modality: {job.modality_slug}")
        if job.patient and job.modality_slug == 'cbct':
            logger.info(f"Updating patient CBCT processing status")
            job.patient.cbct_processing_status = 'processed'
            job.patient.save()
        elif job.patient and job.modality_slug == 'ios':
            logger.info(f"Updating patient IOS processing status")
            job.patient.ios_processing_status = 'processed'
            job.patient.save()
            
            # Update bite classification jobs that depend on this IOS job
            try:
                dependent_bite_jobs = job.dependent_jobs.filter(modality_slug='bite_classification')
                for bite_job in dependent_bite_jobs:
                    if output_files:
                        bite_job.input_file_path = json.dumps(output_files)
                        bite_job.save()
                        logger.info(f"Updated bite classification job #{bite_job.id} with IOS output files: {list(output_files.keys())}")
                    else:
                        logger.warning(f"No output files found for IOS job #{job.id}, cannot update bite classification job #{bite_job.id}")
            except Exception as e:
                logger.error(f"Error updating dependent bite classification jobs: {e}")
        elif job.voice_caption and job.modality_slug == 'audio':
            
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
            
            # Save the original transcription when processing is first completed
            job.voice_caption.save_original_transcription()
            job.voice_caption.save()
            
        elif job.patient and job.modality_slug == 'bite_classification':
            logger.info(f"Bite classification job completed for patient {getattr(job.patient, 'patient_id', 'unknown')}")
            
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
                            patient=job.patient,
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
                        
                        logger.info(f"{'Created' if created else 'Updated'} classification for patient {getattr(job.patient, 'patient_id', 'unknown')}")
                        
                        file_hash = calculate_file_hash(classification_file)
                        file_size = os.path.getsize(classification_file)
                        
                        FileRegistry.objects.create(
                            file_type=get_file_type_for_modality('bite_classification', is_processed=True),
                            file_path=classification_file,
                            file_size=file_size,
                            file_hash=file_hash,
                            patient=job.patient,
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
                logger.error(f"Error processing bite classification completion for patient {getattr(job.patient, 'patient_id', 'unknown')}: {e}")
                logger.error(f"Full traceback: {traceback.format_exc()}")
            
        logger.info(f"mark_job_completed completed successfully")
        return True
        
    except Job.DoesNotExist:
        logger.error(f"Job with ID {job_id} does not exist")
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
        job = Job.objects.get(id=job_id)
        job.mark_failed(error_msg, can_retry)
        
        if job.patient and job.modality_slug == 'cbct':
            job.patient.cbct_processing_status = 'failed'
            job.patient.save()
        elif job.patient and job.modality_slug == 'ios':
            job.patient.ios_processing_status = 'failed'
            job.patient.save()
        elif job.voice_caption and job.modality_slug == 'audio':
            job.voice_caption.processing_status = 'failed'
            job.voice_caption.save()
        elif job.patient and job.modality_slug == 'bite_classification':
            logger.info(f"Bite classification job failed for patient {getattr(job.patient, 'patient_id', 'unknown')}")
            
        return True
        
    except Job.DoesNotExist:
        return False 