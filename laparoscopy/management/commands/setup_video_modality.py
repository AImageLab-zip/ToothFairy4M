"""
Management command to create the 'video' Modality and assign it to the
laparoscopy project. Safe to run multiple times (idempotent).

Usage:
    make manage ARGS='setup_video_modality'
"""
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model

from common.models import Modality, Project


class Command(BaseCommand):
    help = "Create the video modality and assign it to the laparoscopy project."

    def handle(self, *args, **options):
        User = get_user_model()
        admin_user = User.objects.filter(is_superuser=True).first()

        # Create or update the video modality
        modality, created = Modality.objects.get_or_create(
            slug='video',
            defaults={
                'name': 'Video',
                'description': 'Laparoscopy surgical video recording',
                'icon': 'fas fa-video',
                'supported_extensions': [],
                'requires_multiple_files': False,
                'is_active': True,
                'created_by': admin_user,
            },
        )

        if created:
            self.stdout.write(
                self.style.SUCCESS(f"Created Modality: {modality.name} (slug='{modality.slug}')")
            )
        else:
            self.stdout.write(f"Modality '{modality.slug}' already exists — skipping creation.")

        # Ensure the laparoscopy project exists
        project, proj_created = Project.objects.get_or_create(
            slug='laparoscopy',
            defaults={
                'name': 'Laparoscopy',
                'description': 'Laparoscopy surgical video project',
                'created_by': admin_user,
            },
        )
        if proj_created:
            self.stdout.write(self.style.SUCCESS("Created laparoscopy project."))

        # Assign the modality to the project
        if modality not in project.modalities.all():
            project.modalities.add(modality)
            self.stdout.write(
                self.style.SUCCESS(f"Assigned '{modality.slug}' to project '{project.slug}'.")
            )
        else:
            self.stdout.write(
                f"Modality '{modality.slug}' already assigned to project '{project.slug}' — skipping."
            )

        self.stdout.write(self.style.SUCCESS("setup_video_modality complete."))
