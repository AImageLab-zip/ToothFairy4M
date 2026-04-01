from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('maxillo', '0014_patient_deleted'),
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
                help_text='Controls who can access the share link',
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='export',
            name='share_token',
            field=models.CharField(
                blank=True,
                help_text='Random token used for share link access',
                max_length=64,
                null=True,
                unique=True,
            ),
        ),
        migrations.AddField(
            model_name='export',
            name='shared_at',
            field=models.DateTimeField(
                blank=True,
                help_text='When sharing was last enabled',
                null=True,
            ),
        ),
    ]
