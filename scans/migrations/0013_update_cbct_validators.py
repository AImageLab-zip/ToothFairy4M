# Generated manually - Update CBCT field validators to support multiple formats

from django.db import migrations, models
import scans.models


class Migration(migrations.Migration):

    dependencies = [
        ('scans', '0012_invitation'),
    ]

    operations = [
        migrations.AlterField(
            model_name='scanpair',
            name='cbct',
            field=models.FileField(
                blank=True, 
                null=True, 
                upload_to=scans.models.cbct_upload_path, 
                validators=[scans.models.validate_cbct_file]
            ),
        ),
    ]