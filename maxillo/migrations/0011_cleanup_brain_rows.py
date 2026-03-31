from django.db import migrations


def delete_brain_domain_rows(apps, schema_editor):
    Project = apps.get_model('common', 'Project')
    Patient = apps.get_model('maxillo', 'Patient')
    Classification = apps.get_model('maxillo', 'Classification')
    VoiceCaption = apps.get_model('maxillo', 'VoiceCaption')
    Export = apps.get_model('maxillo', 'Export')

    brain_project = Project.objects.filter(slug='brain').first() or Project.objects.filter(name__iexact='brain').first()
    if not brain_project:
        return

    brain_patient_ids = list(Patient.objects.filter(project_id=brain_project.id).values_list('patient_id', flat=True))
    if brain_patient_ids:
        Classification.objects.filter(patient_id__in=brain_patient_ids).delete()
        VoiceCaption.objects.filter(patient_id__in=brain_patient_ids).delete()
        Patient.objects.filter(patient_id__in=brain_patient_ids).delete()

    Export.objects.filter(query_summary__icontains='Brain smoke export').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('common', '0022_backfill_brain_domain_links'),
        ('maxillo', '0010_export_progress_message_export_progress_percent'),
    ]

    operations = [
        migrations.RunPython(delete_brain_domain_rows, migrations.RunPython.noop),
    ]
