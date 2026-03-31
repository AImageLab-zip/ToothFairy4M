from django.db import migrations, models


def clear_voice_caption_modality(apps, schema_editor):
    VoiceCaption = apps.get_model('brain', 'VoiceCaption')
    VoiceCaption.objects.exclude(modality='').update(modality='')


def restore_voice_caption_modality(apps, schema_editor):
    VoiceCaption = apps.get_model('brain', 'VoiceCaption')
    VoiceCaption.objects.filter(modality='').update(modality='ios')


class Migration(migrations.Migration):

    dependencies = [
        ('brain', '0005_copy_brain_data_from_maxillo'),
    ]

    operations = [
        migrations.AlterField(
            model_name='voicecaption',
            name='modality',
            field=models.CharField(blank=True, default='', max_length=255),
        ),
        migrations.RunPython(clear_voice_caption_modality, restore_voice_caption_modality),
    ]
