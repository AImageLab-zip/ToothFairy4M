from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('brain', '0007_patient_deleted'),
    ]

    operations = [
        migrations.AddField(
            model_name='export',
            name='share_mode',
            field=models.CharField(
                choices=[
                    ('private', 'Private'),
                    ('authenticated', 'Any logged-in user'),
                    ('public', 'Anyone with link'),
                ],
                default='private',
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='export',
            name='share_token',
            field=models.CharField(blank=True, max_length=64, null=True, unique=True),
        ),
        migrations.AddField(
            model_name='export',
            name='shared_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
