import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('brain', '0005_copy_brain_data_from_maxillo'),
        ('common', '0020_invitation_projects_m2m'),
    ]

    operations = [
        migrations.AddField(
            model_name='fileregistry',
            name='brain_patient',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='files', to='brain.patient'),
        ),
        migrations.AddField(
            model_name='fileregistry',
            name='brain_voice_caption',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='files', to='brain.voicecaption'),
        ),
        migrations.AddField(
            model_name='fileregistry',
            name='domain',
            field=models.CharField(choices=[('maxillo', 'Maxillo'), ('brain', 'Brain')], default='maxillo', max_length=20),
        ),
        migrations.AddField(
            model_name='job',
            name='brain_patient',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='jobs', to='brain.patient'),
        ),
        migrations.AddField(
            model_name='job',
            name='brain_voice_caption',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='jobs', to='brain.voicecaption'),
        ),
        migrations.AddField(
            model_name='job',
            name='domain',
            field=models.CharField(choices=[('maxillo', 'Maxillo'), ('brain', 'Brain')], default='maxillo', max_length=20),
        ),
        migrations.AddField(
            model_name='processingjob',
            name='brain_patient',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='processing_jobs', to='brain.patient'),
        ),
        migrations.AddField(
            model_name='processingjob',
            name='brain_voice_caption',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='processing_jobs', to='brain.voicecaption'),
        ),
        migrations.AddField(
            model_name='processingjob',
            name='domain',
            field=models.CharField(choices=[('maxillo', 'Maxillo'), ('brain', 'Brain')], default='maxillo', max_length=20),
        ),
        migrations.AddIndex(
            model_name='fileregistry',
            index=models.Index(fields=['domain', 'file_type', 'created_at'], name='common_file_domain_22309d_idx'),
        ),
        migrations.AddIndex(
            model_name='fileregistry',
            index=models.Index(fields=['domain', 'file_type', 'patient'], name='common_file_domain_2ca253_idx'),
        ),
        migrations.AddIndex(
            model_name='fileregistry',
            index=models.Index(fields=['domain', 'file_type', 'brain_patient'], name='common_file_domain_a21df0_idx'),
        ),
        migrations.AddIndex(
            model_name='job',
            index=models.Index(fields=['domain', 'status', 'created_at'], name='common_job_domain_24ebf4_idx'),
        ),
        migrations.AddIndex(
            model_name='job',
            index=models.Index(fields=['domain', 'modality_slug', 'status'], name='common_job_domain_82fd40_idx'),
        ),
        migrations.AddIndex(
            model_name='processingjob',
            index=models.Index(fields=['domain', 'status', 'created_at'], name='common_proc_domain_4734bf_idx'),
        ),
        migrations.AddIndex(
            model_name='processingjob',
            index=models.Index(fields=['domain', 'job_type', 'status'], name='common_proc_domain_8264b6_idx'),
        ),
    ]
