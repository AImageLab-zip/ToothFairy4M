# Generated manually for adding VoiceCaption model
from django.conf import settings
from django.db import migrations, models
import django.core.validators
import scans.models


class Migration(migrations.Migration):

    dependencies = [
        ('scans', '0005_add_processing_status'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='VoiceCaption',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('audio_file', models.FileField(
                    upload_to=scans.models.voice_caption_upload_path,
                    validators=[django.core.validators.FileExtensionValidator(allowed_extensions=['wav', 'mp3', 'ogg', 'webm'])]
                )),
                ('duration', models.FloatField(help_text='Duration of audio recording in seconds')),
                ('text_caption', models.TextField(blank=True, help_text='Transcribed text from audio', null=True)),
                ('processing_status', models.CharField(
                    choices=[
                        ('pending', 'Pending'),
                        ('processing', 'Processing'),
                        ('completed', 'Completed'),
                        ('failed', 'Failed')
                    ],
                    default='pending',
                    help_text='Status of speech-to-text processing',
                    max_length=20
                )),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('scanpair', models.ForeignKey(on_delete=models.CASCADE, related_name='voice_captions', to='scans.scanpair')),
                ('user', models.ForeignKey(on_delete=models.CASCADE, related_name='voice_captions', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
    ] 