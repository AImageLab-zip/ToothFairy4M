from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('maxillo', '0011_cleanup_brain_rows'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='patient',
            name='project',
        ),
    ]
