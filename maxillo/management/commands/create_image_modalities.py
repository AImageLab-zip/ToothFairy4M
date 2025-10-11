from django.core.management.base import BaseCommand
from common.models import Modality


class Command(BaseCommand):
    help = 'Create new image modalities for the maxillo app'

    def handle(self, *args, **options):
        modalities_data = [
            {
                'name': 'Intraoral Photographs',
                'slug': 'intraoral',
                'description': 'Multiple intraoral photographs (1-10 images)',
                'icon': 'fas fa-camera',
                'supported_extensions': ['.jpg', '.jpeg', '.png'],
                'requires_multiple_files': True,
                'is_active': True,
            },
            {
                'name': 'Teleradiography',
                'slug': 'teleradiography',
                'description': 'Single teleradiography image',
                'icon': 'fas fa-x-ray',
                'supported_extensions': ['.jpg', '.jpeg', '.png'],
                'requires_multiple_files': False,
                'is_active': True,
            },
            {
                'name': 'panoramic',
                'slug': 'panoramic',
                'description': 'Single panoramic image',
                'icon': 'fas fa-panorama',
                'supported_extensions': ['.jpg', '.jpeg', '.png'],
                'requires_multiple_files': False,
                'is_active': True,
            },
        ]

        for modality_data in modalities_data:
            modality, created = Modality.objects.get_or_create(
                slug=modality_data['slug'],
                defaults=modality_data
            )
            
            if created:
                self.stdout.write(
                    self.style.SUCCESS(f'Created modality: {modality.name}')
                )
            else:
                self.stdout.write(
                    self.style.WARNING(f'Modality already exists: {modality.name}')
                )
                # Update existing modality with new data
                for key, value in modality_data.items():
                    if key != 'slug':
                        setattr(modality, key, value)
                modality.save()
                self.stdout.write(
                    self.style.SUCCESS(f'Updated modality: {modality.name}')
                )
