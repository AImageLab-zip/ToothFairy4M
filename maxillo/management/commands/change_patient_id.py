from django.core.management.base import BaseCommand
from django.db import connection, transaction
from maxillo.models import Patient
import os
import shutil


class Command(BaseCommand):
    help = 'Change a patient ID and update all references'

    def add_arguments(self, parser):
        parser.add_argument('old_id', type=int, help='Old patient ID')
        parser.add_argument('new_id', type=int, help='New patient ID')
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be changed without making actual changes',
        )

    def handle(self, *args, **options):
        old_id = options['old_id']
        new_id = options['new_id']
        dry_run = options['dry_run']

        # Check if old patient exists
        try:
            old_patient = Patient.objects.get(patient_id=old_id)
        except Patient.DoesNotExist:
            self.stdout.write(self.style.ERROR(f'Patient {old_id} does not exist'))
            return

        # Check if new ID is already taken
        if Patient.objects.filter(patient_id=new_id).exists():
            self.stdout.write(self.style.ERROR(f'Patient {new_id} already exists'))
            return

        self.stdout.write(self.style.SUCCESS(f'Found patient {old_id}: {old_patient.name}'))
        
        # Get all related objects before the change
        from common.models import Job, FileRegistry
        from maxillo.models import Classification, VoiceCaption
        
        jobs = Job.objects.filter(patient_id=old_id)
        files = FileRegistry.objects.filter(patient_id=old_id)
        classifications = Classification.objects.filter(patient_id=old_id)
        voice_captions = VoiceCaption.objects.filter(patient_id=old_id)
        
        self.stdout.write(self.style.WARNING(f'\nRelated records found:'))
        self.stdout.write(f'  - Jobs: {jobs.count()}')
        self.stdout.write(f'  - FileRegistry: {files.count()}')
        self.stdout.write(f'  - Classifications: {classifications.count()}')
        self.stdout.write(f'  - VoiceCaption: {voice_captions.count()}')
        
        # Get file paths that need to be updated
        file_paths_to_update = []
        
        # Check old FileField paths
        if old_patient.upper_scan_raw:
            file_paths_to_update.append(('upper_scan_raw', old_patient.upper_scan_raw.name))
        if old_patient.lower_scan_raw:
            file_paths_to_update.append(('lower_scan_raw', old_patient.lower_scan_raw.name))
        if old_patient.upper_scan_norm:
            file_paths_to_update.append(('upper_scan_norm', old_patient.upper_scan_norm.name))
        if old_patient.lower_scan_norm:
            file_paths_to_update.append(('lower_scan_norm', old_patient.lower_scan_norm.name))
        if old_patient.cbct:
            file_paths_to_update.append(('cbct', old_patient.cbct.name))
        
        # Check FileRegistry paths
        for file_obj in files:
            if file_obj.file_path and f'patient_{old_id}' in file_obj.file_path:
                file_paths_to_update.append(('FileRegistry', file_obj.file_path))
        
        if file_paths_to_update:
            self.stdout.write(self.style.WARNING(f'\nFile paths containing patient_{old_id}:'))
            for field, path in file_paths_to_update[:5]:  # Show first 5
                self.stdout.write(f'  - {field}: {path}')
            if len(file_paths_to_update) > 5:
                self.stdout.write(f'  ... and {len(file_paths_to_update) - 5} more')
        
        if dry_run:
            self.stdout.write(self.style.WARNING(f'\nDRY RUN - No changes made'))
            self.stdout.write(f'Would change patient ID from {old_id} to {new_id}')
            return
        
        # Confirm before proceeding
        confirm = input(f'\nAre you sure you want to change patient ID from {old_id} to {new_id}? (yes/no): ')
        if confirm.lower() != 'yes':
            self.stdout.write(self.style.WARNING('Operation cancelled'))
            return
        
        # Perform the update in a transaction
        try:
            with transaction.atomic():
                # Since patient_id is an AutoField (primary key), we need to use raw SQL
                # First, temporarily disable foreign key checks
                with connection.cursor() as cursor:
                    # MySQL/MariaDB syntax
                    cursor.execute('SET FOREIGN_KEY_CHECKS=0;')
                    
                    # Update the patient ID directly
                    cursor.execute(
                        'UPDATE scans_patient SET patient_id = %s WHERE patient_id = %s',
                        [new_id, old_id]
                    )
                    
                    # Update all foreign key references
                    # Jobs table
                    cursor.execute(
                        'UPDATE scans_job SET patient_id = %s WHERE patient_id = %s',
                        [new_id, old_id]
                    )
                    
                    # FileRegistry table
                    cursor.execute(
                        'UPDATE scans_fileregistry SET patient_id = %s WHERE patient_id = %s',
                        [new_id, old_id]
                    )
                    
                    # Classification table
                    cursor.execute(
                        'UPDATE scans_classification SET patient_id = %s WHERE patient_id = %s',
                        [new_id, old_id]
                    )
                    
                    # VoiceCaption table
                    cursor.execute(
                        'UPDATE scans_voicecaption SET patient_id = %s WHERE patient_id = %s',
                        [new_id, old_id]
                    )
                    
                    # ManyToMany table for modalities
                    cursor.execute(
                        'UPDATE scans_patient_modalities SET patient_id = %s WHERE patient_id = %s',
                        [new_id, old_id]
                    )
                    
                    # ManyToMany table for tags
                    cursor.execute(
                        'UPDATE scans_patient_tags SET patient_id = %s WHERE patient_id = %s',
                        [new_id, old_id]
                    )
                    
                    # Re-enable foreign key checks
                    cursor.execute('SET FOREIGN_KEY_CHECKS=1;')
                
                # Now update file paths in FileRegistry
                updated_patient = Patient.objects.get(patient_id=new_id)
                
                # Update FileRegistry file_path field
                for file_obj in FileRegistry.objects.filter(patient_id=new_id):
                    if file_obj.file_path and f'patient_{old_id}' in file_obj.file_path:
                        old_file_path = file_obj.file_path
                        new_file_path = old_file_path.replace(f'patient_{old_id}', f'patient_{new_id}')
                        
                        # Rename physical file/directory if it exists
                        if os.path.exists(old_file_path):
                            # Create new directory if needed
                            new_dir = os.path.dirname(new_file_path)
                            if not os.path.exists(new_dir):
                                os.makedirs(new_dir, exist_ok=True)
                            
                            # Move the file
                            shutil.move(old_file_path, new_file_path)
                            self.stdout.write(f'Moved: {old_file_path} -> {new_file_path}')
                        
                        # Update the database record
                        file_obj.file_path = new_file_path
                        file_obj.save()
                
                # Try to rename the patient directory if it exists
                old_patient_dir = f'/dataset/scans/patient_{old_id}'
                new_patient_dir = f'/dataset/scans/patient_{new_id}'
                
                if os.path.exists(old_patient_dir):
                    if not os.path.exists(new_patient_dir):
                        shutil.move(old_patient_dir, new_patient_dir)
                        self.stdout.write(f'Renamed directory: {old_patient_dir} -> {new_patient_dir}')
                    else:
                        self.stdout.write(self.style.WARNING(f'Warning: New directory already exists: {new_patient_dir}'))
                
                self.stdout.write(self.style.SUCCESS(f'\nSuccessfully changed patient ID from {old_id} to {new_id}'))
                self.stdout.write(f'Updated {jobs.count()} jobs')
                self.stdout.write(f'Updated {files.count()} file registry entries')
                self.stdout.write(f'Updated {classifications.count()} classifications')
                self.stdout.write(f'Updated {voice_captions.count()} voice captions')
                
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'Error changing patient ID: {e}'))
            raise

