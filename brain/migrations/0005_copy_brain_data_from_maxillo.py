from django.db import migrations


def _get_brain_project_id(Project):
    project = Project.objects.filter(slug='brain').first()
    if project:
        return project.id
    project = Project.objects.filter(name__iexact='brain').first()
    if project:
        return project.id
    return None


def _collect_folder_ids(maxillo_patients, maxillo_folder_model):
    folder_ids = set(
        maxillo_patients.exclude(folder_id__isnull=True).values_list('folder_id', flat=True)
    )
    if not folder_ids:
        return set()

    parent_map = dict(
        maxillo_folder_model.objects.filter(id__in=folder_ids).values_list('id', 'parent_id')
    )
    to_check = list(folder_ids)
    while to_check:
        folder_id = to_check.pop()
        parent_id = parent_map.get(folder_id)
        if parent_id and parent_id not in folder_ids:
            folder_ids.add(parent_id)
            to_check.append(parent_id)
            parent_map[parent_id] = maxillo_folder_model.objects.filter(id=parent_id).values_list('parent_id', flat=True).first()

    return folder_ids


def copy_brain_data_from_maxillo(apps, schema_editor):
    Project = apps.get_model('common', 'Project')

    MaxilloDataset = apps.get_model('maxillo', 'Dataset')
    MaxilloFolder = apps.get_model('maxillo', 'Folder')
    MaxilloTag = apps.get_model('maxillo', 'Tag')
    MaxilloPatient = apps.get_model('maxillo', 'Patient')
    MaxilloClassification = apps.get_model('maxillo', 'Classification')
    MaxilloVoiceCaption = apps.get_model('maxillo', 'VoiceCaption')
    MaxilloExport = apps.get_model('maxillo', 'Export')

    BrainDataset = apps.get_model('brain', 'Dataset')
    BrainFolder = apps.get_model('brain', 'Folder')
    BrainTag = apps.get_model('brain', 'Tag')
    BrainPatient = apps.get_model('brain', 'Patient')
    BrainClassification = apps.get_model('brain', 'Classification')
    BrainVoiceCaption = apps.get_model('brain', 'VoiceCaption')
    BrainExport = apps.get_model('brain', 'Export')

    brain_project_id = _get_brain_project_id(Project)
    if not brain_project_id:
        return

    brain_patients_qs = MaxilloPatient.objects.filter(project_id=brain_project_id)
    brain_patient_ids = list(brain_patients_qs.values_list('patient_id', flat=True))
    if not brain_patient_ids:
        return

    dataset_ids = set(
        brain_patients_qs.exclude(dataset_id__isnull=True).values_list('dataset_id', flat=True)
    )
    for dataset in MaxilloDataset.objects.filter(id__in=dataset_ids):
        BrainDataset.objects.update_or_create(
            id=dataset.id,
            defaults={
                'name': dataset.name,
                'description': dataset.description,
                'created_at': dataset.created_at,
                'created_by_id': dataset.created_by_id,
            },
        )

    folder_ids = _collect_folder_ids(brain_patients_qs, MaxilloFolder)
    if folder_ids:
        folder_rows = {
            row.id: row
            for row in MaxilloFolder.objects.filter(id__in=folder_ids)
        }

        depth_cache = {}

        def depth(folder_id):
            if folder_id in depth_cache:
                return depth_cache[folder_id]
            parent_id = folder_rows[folder_id].parent_id
            if not parent_id or parent_id not in folder_rows:
                depth_cache[folder_id] = 0
                return 0
            d = depth(parent_id) + 1
            depth_cache[folder_id] = d
            return d

        for folder_id in sorted(folder_rows.keys(), key=depth):
            folder = folder_rows[folder_id]
            parent_id = folder.parent_id if folder.parent_id in folder_rows else None
            BrainFolder.objects.update_or_create(
                id=folder.id,
                defaults={
                    'name': folder.name,
                    'parent_id': parent_id,
                    'created_at': folder.created_at,
                    'created_by_id': folder.created_by_id,
                },
            )

    patient_tag_through = MaxilloPatient.tags.through
    patient_modality_through = MaxilloPatient.modalities.through

    tag_ids = set(
        patient_tag_through.objects.filter(patient_id__in=brain_patient_ids).values_list('tag_id', flat=True)
    )
    for tag in MaxilloTag.objects.filter(id__in=tag_ids):
        BrainTag.objects.update_or_create(
            id=tag.id,
            defaults={
                'name': tag.name,
                'created_at': tag.created_at,
            },
        )

    for patient in MaxilloPatient.objects.filter(patient_id__in=brain_patient_ids):
        BrainPatient.objects.update_or_create(
            patient_id=patient.patient_id,
            defaults={
                'name': patient.name,
                'dataset_id': patient.dataset_id,
                'folder_id': patient.folder_id,
                'upper_scan_raw': patient.upper_scan_raw,
                'lower_scan_raw': patient.lower_scan_raw,
                'upper_scan_norm': patient.upper_scan_norm,
                'lower_scan_norm': patient.lower_scan_norm,
                'cbct': patient.cbct,
                'ios_processing_status': patient.ios_processing_status,
                'cbct_processing_status': patient.cbct_processing_status,
                'visibility': patient.visibility,
                'uploaded_at': patient.uploaded_at,
                'uploaded_by_id': patient.uploaded_by_id,
            },
        )

    for patient in MaxilloPatient.objects.filter(patient_id__in=brain_patient_ids):
        brain_patient = BrainPatient.objects.get(patient_id=patient.patient_id)

        modality_ids = list(
            patient_modality_through.objects.filter(patient_id=patient.patient_id).values_list('modality_id', flat=True)
        )
        if modality_ids:
            brain_patient.modalities.set(modality_ids)

        brain_tag_ids = list(
            patient_tag_through.objects.filter(patient_id=patient.patient_id).values_list('tag_id', flat=True)
        )
        if brain_tag_ids:
            brain_patient.tags.set(brain_tag_ids)

    for classification in MaxilloClassification.objects.filter(patient_id__in=brain_patient_ids):
        BrainClassification.objects.update_or_create(
            id=classification.id,
            defaults={
                'patient_id': classification.patient_id,
                'classifier': classification.classifier,
                'sagittal_left': classification.sagittal_left,
                'sagittal_right': classification.sagittal_right,
                'vertical': classification.vertical,
                'transverse': classification.transverse,
                'midline': classification.midline,
                'annotator_id': classification.annotator_id,
                'timestamp': classification.timestamp,
            },
        )

    for voice_caption in MaxilloVoiceCaption.objects.filter(patient_id__in=brain_patient_ids):
        BrainVoiceCaption.objects.update_or_create(
            id=voice_caption.id,
            defaults={
                'patient_id': voice_caption.patient_id,
                'user_id': voice_caption.user_id,
                'modality': voice_caption.modality,
                'duration': voice_caption.duration,
                'text_caption': voice_caption.text_caption,
                'original_text_caption': voice_caption.original_text_caption,
                'is_edited': voice_caption.is_edited,
                'edit_history': voice_caption.edit_history,
                'processing_status': voice_caption.processing_status,
                'created_at': voice_caption.created_at,
                'updated_at': voice_caption.updated_at,
            },
        )

    brain_folder_ids = set(BrainFolder.objects.values_list('id', flat=True))
    for export in MaxilloExport.objects.all():
        params = export.query_params or {}
        folder_ids = params.get('folder_ids') or []
        normalized_ids = set()
        for folder_id in folder_ids:
            try:
                normalized_ids.add(int(folder_id))
            except (TypeError, ValueError):
                continue

        if normalized_ids and not normalized_ids.intersection(brain_folder_ids):
            continue

        BrainExport.objects.update_or_create(
            id=export.id,
            defaults={
                'user_id': export.user_id,
                'status': export.status,
                'query_params': export.query_params,
                'query_summary': export.query_summary,
                'file_path': export.file_path,
                'file_size': export.file_size,
                'patient_count': export.patient_count,
                'created_at': export.created_at,
                'started_at': export.started_at,
                'completed_at': export.completed_at,
                'error_message': export.error_message,
                'progress_message': export.progress_message,
                'progress_percent': export.progress_percent,
            },
        )


class Migration(migrations.Migration):

    dependencies = [
        ('brain', '0004_initial'),
        ('maxillo', '0010_export_progress_message_export_progress_percent'),
    ]

    operations = [
        migrations.RunPython(copy_brain_data_from_maxillo, migrations.RunPython.noop),
    ]
