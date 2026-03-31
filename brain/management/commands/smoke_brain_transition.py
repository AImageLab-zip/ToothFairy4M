import json
import uuid

from django.contrib.auth.models import User
from django.core.management.base import BaseCommand
from django.test import Client
from django.urls import reverse


class Command(BaseCommand):
    help = 'Run strict-separation smoke for brain namespace (folder/upload/tag/classification/export)'

    def add_arguments(self, parser):
        parser.add_argument('--keep', action='store_true', help='Keep smoke-test data instead of cleaning it up')

    def handle(self, *args, **options):
        from brain.models import Export as BrainExport
        from brain.models import Folder as BrainFolder
        from brain.models import Patient as BrainPatient
        from brain.models import Tag as BrainTag
        from common.models import Project, ProjectAccess
        from maxillo.models import Patient as MaxilloPatient

        keep = options['keep']

        brain_project = Project.objects.filter(slug='brain').first() or Project.objects.filter(name__iexact='brain').first()
        if not brain_project:
            self.stdout.write(self.style.ERROR('Brain project not found'))
            return

        user = User.objects.filter(is_staff=True).first() or User.objects.first()
        if not user:
            self.stdout.write(self.style.ERROR('No users found for smoke test'))
            return

        access = ProjectAccess.objects.filter(user=user, project=brain_project).first()
        if not access:
            access = ProjectAccess.objects.create(user=user, project=brain_project, role='admin')

        client = Client(HTTP_HOST='localhost')
        client.force_login(user)
        session = client.session
        session['current_project_id'] = brain_project.id
        session.save()

        token = uuid.uuid4().hex[:8]
        folder_name = f'BrainSmokeFolder_{token}'
        patient_name = f'BrainSmokePatient_{token}'
        tag_name = f'brain-smoke-tag-{token}'

        folder_id = None
        patient_id = None
        export_id = None

        try:
            create_folder_resp = client.post(
                reverse('brain:create_folder'),
                data=json.dumps({'name': folder_name}),
                content_type='application/json',
            )
            if create_folder_resp.status_code != 200:
                raise RuntimeError(f'create_folder failed: {create_folder_resp.status_code}')
            folder_id = create_folder_resp.json()['folder']['id']

            upload_resp = client.post(
                reverse('brain:upload_patient'),
                data={
                    'name': patient_name,
                    'visibility': 'private',
                    'folder': str(folder_id),
                },
            )
            if upload_resp.status_code not in (200, 302):
                raise RuntimeError(f'upload_patient failed: {upload_resp.status_code}')

            brain_patient = BrainPatient.objects.filter(name=patient_name).order_by('-patient_id').first()
            if not brain_patient:
                raise RuntimeError('Brain patient not created')
            patient_id = brain_patient.patient_id

            if MaxilloPatient.objects.filter(patient_id=patient_id).exists():
                raise RuntimeError('Strict separation violated: maxillo patient created for brain upload')

            add_tag_resp = client.post(
                reverse('brain:add_patient_tag', kwargs={'patient_id': patient_id}),
                data=json.dumps({'tag': tag_name}),
                content_type='application/json',
            )
            if add_tag_resp.status_code != 200:
                raise RuntimeError(f'add_patient_tag failed: {add_tag_resp.status_code}')

            classify_resp = client.post(
                reverse('brain:update_classification', kwargs={'patient_id': patient_id}),
                data=json.dumps({'field': 'midline', 'value': 'centered'}),
                content_type='application/json',
            )
            if classify_resp.status_code != 200:
                raise RuntimeError(f'update_classification failed: {classify_resp.status_code}')

            export = BrainExport.objects.create(
                user=user,
                status='pending',
                query_params={
                    'folder_ids': [folder_id],
                    'modality_slugs': ['reports'],
                    'filters': {},
                },
                query_summary=f'Brain smoke export {token}',
            )
            export_id = export.id

            self.stdout.write(self.style.SUCCESS('Smoke steps completed successfully under strict separation.'))
            self.stdout.write(f'patient_id={patient_id} folder_id={folder_id} export_id={export_id}')

        finally:
            if keep:
                self.stdout.write(self.style.WARNING('Keeping smoke data as requested (--keep).'))
                return

            if export_id:
                BrainExport.objects.filter(id=export_id).delete()

            if patient_id:
                BrainPatient.objects.filter(patient_id=patient_id).delete()

            if tag_name:
                tag = BrainTag.objects.filter(name=tag_name).first()
                if tag and not tag.patients.exists():
                    tag.delete()

            if folder_id:
                folder = BrainFolder.objects.filter(id=folder_id).first()
                if folder and not folder.patients.exists():
                    folder.delete()

            self.stdout.write('Smoke test cleanup completed.')
