from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('brain', '0006_clear_voicecaption_modality'),
    ]

    operations = [
        migrations.AddField(
            model_name='patient',
            name='deleted',
            field=models.BooleanField(db_index=True, default=False),
        ),
    ]
