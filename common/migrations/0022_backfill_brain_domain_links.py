from django.db import migrations


def backfill_brain_domain_links(apps, schema_editor):
    Project = apps.get_model('common', 'Project')
    Job = apps.get_model('common', 'Job')
    ProcessingJob = apps.get_model('common', 'ProcessingJob')
    FileRegistry = apps.get_model('common', 'FileRegistry')
    MaxilloPatient = apps.get_model('maxillo', 'Patient')
    BrainPatient = apps.get_model('brain', 'Patient')
    BrainVoiceCaption = apps.get_model('brain', 'VoiceCaption')

    brain_project = Project.objects.filter(slug='brain').first() or Project.objects.filter(name__iexact='brain').first()
    if not brain_project:
        return

    brain_patient_ids = set(MaxilloPatient.objects.filter(project_id=brain_project.id).values_list('patient_id', flat=True))

    for job in Job.objects.filter(patient_id__in=brain_patient_ids):
        job.domain = 'brain'
        if BrainPatient.objects.filter(patient_id=job.patient_id).exists():
            job.brain_patient_id = job.patient_id
            job.patient_id = None
        if job.voice_caption_id and BrainVoiceCaption.objects.filter(id=job.voice_caption_id).exists():
            job.brain_voice_caption_id = job.voice_caption_id
            job.voice_caption_id = None
        job.save(update_fields=['domain', 'brain_patient', 'patient', 'brain_voice_caption', 'voice_caption'])

    for pjob in ProcessingJob.objects.filter(patient_id__in=brain_patient_ids):
        pjob.domain = 'brain'
        if BrainPatient.objects.filter(patient_id=pjob.patient_id).exists():
            pjob.brain_patient_id = pjob.patient_id
            pjob.patient_id = None
        if pjob.voice_caption_id and BrainVoiceCaption.objects.filter(id=pjob.voice_caption_id).exists():
            pjob.brain_voice_caption_id = pjob.voice_caption_id
            pjob.voice_caption_id = None
        pjob.save(update_fields=['domain', 'brain_patient', 'patient', 'brain_voice_caption', 'voice_caption'])

    for file_row in FileRegistry.objects.filter(patient_id__in=brain_patient_ids):
        file_row.domain = 'brain'
        if BrainPatient.objects.filter(patient_id=file_row.patient_id).exists():
            file_row.brain_patient_id = file_row.patient_id
            file_row.patient_id = None
        if file_row.voice_caption_id and BrainVoiceCaption.objects.filter(id=file_row.voice_caption_id).exists():
            file_row.brain_voice_caption_id = file_row.voice_caption_id
            file_row.voice_caption_id = None
        file_row.save(update_fields=['domain', 'brain_patient', 'patient', 'brain_voice_caption', 'voice_caption'])


class Migration(migrations.Migration):

    dependencies = [
        ('common', '0021_domain_split_fields'),
    ]

    operations = [
        migrations.RunPython(backfill_brain_domain_links, migrations.RunPython.noop),
    ]
