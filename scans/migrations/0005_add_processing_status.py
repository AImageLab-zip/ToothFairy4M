# Generated manually for adding processing status fields
from django.db import migrations, models
import django.core.validators
import scans.models


class Migration(migrations.Migration):

    dependencies = [
        ('scans', '0004_scanpair_name'),
    ]

    operations = [
        migrations.AddField(
            model_name='scanpair',
            name='ios_processing_status',
            field=models.CharField(
                choices=[
                    ('not_uploaded', 'Not Uploaded'),
                    ('processing', 'Processing'),
                    ('processed', 'Processed'),
                    ('failed', 'Processing Failed')
                ],
                default='not_uploaded',
                help_text='Processing status for intra-oral scans (upper and lower)',
                max_length=20
            ),
        ),
        migrations.AddField(
            model_name='scanpair',
            name='cbct_processing_status',
            field=models.CharField(
                choices=[
                    ('not_uploaded', 'Not Uploaded'),
                    ('processing', 'Processing'),
                    ('processed', 'Processed'),
                    ('failed', 'Processing Failed')
                ],
                default='not_uploaded',
                help_text='Processing status for CBCT scan',
                max_length=20
            ),
        ),
        migrations.AlterField(
            model_name='scanpair',
            name='upper_scan_raw',
            field=models.FileField(
                blank=True,
                null=True,
                upload_to=scans.models.scan_upload_path,
                validators=[django.core.validators.FileExtensionValidator(allowed_extensions=['stl'])]
            ),
        ),
        migrations.AlterField(
            model_name='scanpair',
            name='lower_scan_raw',
            field=models.FileField(
                blank=True,
                null=True,
                upload_to=scans.models.scan_upload_path,
                validators=[django.core.validators.FileExtensionValidator(allowed_extensions=['stl'])]
            ),
        ),
    ] 