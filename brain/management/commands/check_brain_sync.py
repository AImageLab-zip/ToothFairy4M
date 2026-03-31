from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = 'Check integrity of brain domain data and common domain links'

    def add_arguments(self, parser):
        parser.add_argument('--sample', type=int, default=20, help='Max mismatch IDs to print per check')

    def handle(self, *args, **options):
        from brain.models import Classification, Export, Folder, Patient, Tag, VoiceCaption
        from common.models import FileRegistry, Job, ProcessingJob

        sample = options['sample']

        patient_ids = set(Patient.objects.values_list('patient_id', flat=True))
        folder_ids = set(Folder.objects.values_list('id', flat=True))
        tag_ids = set(Tag.objects.values_list('id', flat=True))
        class_ids = set(Classification.objects.values_list('id', flat=True))
        voice_ids = set(VoiceCaption.objects.values_list('id', flat=True))
        export_ids = set(Export.objects.values_list('id', flat=True))

        self.stdout.write(f'Brain tables: patients={len(patient_ids)} folders={len(folder_ids)} tags={len(tag_ids)} classifications={len(class_ids)} voice={len(voice_ids)} exports={len(export_ids)}')

        job_patient_ids = set(Job.objects.filter(domain='brain').exclude(brain_patient_id__isnull=True).values_list('brain_patient_id', flat=True))
        self._report_subset('Job.brain_patient -> brain.Patient', job_patient_ids, patient_ids, sample)

        file_patient_ids = set(FileRegistry.objects.filter(domain='brain').exclude(brain_patient_id__isnull=True).values_list('brain_patient_id', flat=True))
        self._report_subset('FileRegistry.brain_patient -> brain.Patient', file_patient_ids, patient_ids, sample)

        pj_patient_ids = set(ProcessingJob.objects.filter(domain='brain').exclude(brain_patient_id__isnull=True).values_list('brain_patient_id', flat=True))
        self._report_subset('ProcessingJob.brain_patient -> brain.Patient', pj_patient_ids, patient_ids, sample)

        job_voice_ids = set(Job.objects.filter(domain='brain').exclude(brain_voice_caption_id__isnull=True).values_list('brain_voice_caption_id', flat=True))
        self._report_subset('Job.brain_voice_caption -> brain.VoiceCaption', job_voice_ids, voice_ids, sample)

        file_voice_ids = set(FileRegistry.objects.filter(domain='brain').exclude(brain_voice_caption_id__isnull=True).values_list('brain_voice_caption_id', flat=True))
        self._report_subset('FileRegistry.brain_voice_caption -> brain.VoiceCaption', file_voice_ids, voice_ids, sample)

        pj_voice_ids = set(ProcessingJob.objects.filter(domain='brain').exclude(brain_voice_caption_id__isnull=True).values_list('brain_voice_caption_id', flat=True))
        self._report_subset('ProcessingJob.brain_voice_caption -> brain.VoiceCaption', pj_voice_ids, voice_ids, sample)

        self.stdout.write(self.style.SUCCESS('Brain integrity check completed.'))

    def _report_subset(self, label, linked_ids, target_ids, sample):
        invalid = sorted(linked_ids - target_ids)
        if not invalid:
            self.stdout.write(f'[OK] {label}: {len(linked_ids)} linked IDs valid')
            return

        preview = invalid[:sample]
        self.stdout.write(f'[DRIFT] {label}: invalid references={len(invalid)} preview={preview}')
