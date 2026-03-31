from django.core.management.base import BaseCommand
from django.db import models


class Command(BaseCommand):
    help = 'Repair common domain links for brain rows using brain tables as source of truth'

    def handle(self, *args, **options):
        from brain.models import Patient, VoiceCaption
        from common.models import FileRegistry, Job, ProcessingJob

        patient_ids = list(Patient.objects.values_list('patient_id', flat=True))
        voice_ids = list(VoiceCaption.objects.values_list('id', flat=True))

        jobs_updated = Job.objects.filter(patient_id__in=patient_ids).update(
            domain='brain',
            brain_patient_id=models.F('patient_id'),
            patient_id=None,
        )
        jobs_voice_updated = Job.objects.filter(voice_caption_id__in=voice_ids).update(
            domain='brain',
            brain_voice_caption_id=models.F('voice_caption_id'),
            voice_caption_id=None,
        )

        files_updated = FileRegistry.objects.filter(patient_id__in=patient_ids).update(
            domain='brain',
            brain_patient_id=models.F('patient_id'),
            patient_id=None,
        )
        files_voice_updated = FileRegistry.objects.filter(voice_caption_id__in=voice_ids).update(
            domain='brain',
            brain_voice_caption_id=models.F('voice_caption_id'),
            voice_caption_id=None,
        )

        pjobs_updated = ProcessingJob.objects.filter(patient_id__in=patient_ids).update(
            domain='brain',
            brain_patient_id=models.F('patient_id'),
            patient_id=None,
        )
        pjobs_voice_updated = ProcessingJob.objects.filter(voice_caption_id__in=voice_ids).update(
            domain='brain',
            brain_voice_caption_id=models.F('voice_caption_id'),
            voice_caption_id=None,
        )

        self.stdout.write(
            self.style.SUCCESS(
                f'Repair completed: jobs={jobs_updated}/{jobs_voice_updated}, files={files_updated}/{files_voice_updated}, processing_jobs={pjobs_updated}/{pjobs_voice_updated}'
            )
        )
