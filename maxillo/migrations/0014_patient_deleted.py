from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('maxillo', '0013_remove_patient_maxillo_pat_project_30b5f2_idx_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='patient',
            name='deleted',
            field=models.BooleanField(db_index=True, default=False),
        ),
    ]
