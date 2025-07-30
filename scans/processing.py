import os
import subprocess
import shutil
from .models import ScanPair


def copy_files_to_processing_dir(scanpair, scan_type='ios'):
    """
    Copy scan files to shared processing directory for Docker containers
    """
    processing_dir = f"/tmp/processing/scanpair_{scanpair.scanpair_id}"
    os.makedirs(processing_dir, exist_ok=True)
    
    if scan_type == 'ios' and scanpair.has_ios_scans():
        # Copy IOS files
        upper_dest = os.path.join(processing_dir, f"upper_{scanpair.scanpair_id}.stl")
        lower_dest = os.path.join(processing_dir, f"lower_{scanpair.scanpair_id}.stl")
        
        shutil.copy2(scanpair.upper_scan_raw.path, upper_dest)
        shutil.copy2(scanpair.lower_scan_raw.path, lower_dest)
        
        return processing_dir, upper_dest, lower_dest
        
    elif scan_type == 'cbct' and scanpair.has_cbct_scan():
        # Copy CBCT file
        cbct_dest = os.path.join(processing_dir, f"cbct_{scanpair.scanpair_id}.nii")
        shutil.copy2(scanpair.cbct.path, cbct_dest)
        
        return processing_dir, cbct_dest
    
    return None


def execute_ios_processing_command(scanpair):
    """
    Execute Docker command for IOS processing
    """
    try:
        # Update status to processing
        scanpair.ios_processing_status = 'processing'
        scanpair.save()
        
        # Copy files to shared processing directory
        file_info = copy_files_to_processing_dir(scanpair, 'ios')
        if not file_info:
            raise Exception("Failed to copy IOS files to processing directory")
            
        processing_dir, upper_file, lower_file = file_info
        
        # Prepare Docker command
        # TODO: Replace 'your-ios-processor:latest' with your actual Docker image
        command = [
            'docker', 'run', '--rm',
            '-v', f'{processing_dir}:/data',
            'your-ios-processor:latest',  # Replace with your Docker image
            '--scanpair-id', str(scanpair.scanpair_id),
            '--patient-id', str(scanpair.patient.patient_id),
            '--upper-scan', f'/data/{os.path.basename(upper_file)}',
            '--lower-scan', f'/data/{os.path.basename(lower_file)}',
            '--output-dir', '/data'
        ]
        
        print(f"Executing IOS Docker command: {' '.join(command)}")
        
        # Execute the Docker command
        result = subprocess.run(command, capture_output=True, text=True, timeout=300)
        
        if result.returncode == 0:
            print(f"IOS processing completed successfully for ScanPair {scanpair.scanpair_id}")
            # The actual processing script should update the status to 'processed'
            # For now, we'll do it here as a placeholder
            scanpair.ios_processing_status = 'processed'
            scanpair.save()
            
            # Optional: Copy results back to Django storage
            # You can implement this based on your needs
            
            return True
        else:
            print(f"IOS processing failed for ScanPair {scanpair.scanpair_id}: {result.stderr}")
            scanpair.ios_processing_status = 'failed'
            scanpair.save()
            return False
            
    except subprocess.TimeoutExpired:
        print(f"IOS processing timed out for ScanPair {scanpair.scanpair_id}")
        scanpair.ios_processing_status = 'failed'
        scanpair.save()
        return False
    except Exception as e:
        print(f"Error executing IOS processing command for ScanPair {scanpair.scanpair_id}: {e}")
        scanpair.ios_processing_status = 'failed'
        scanpair.save()
        return False
    finally:
        # Cleanup: Remove processing directory
        if 'processing_dir' in locals():
            try:
                shutil.rmtree(processing_dir)
            except:
                pass


def execute_cbct_processing_command(scanpair):
    """
    Execute Docker command for CBCT processing
    """
    try:
        # Update status to processing
        scanpair.cbct_processing_status = 'processing'
        scanpair.save()
        
        # Copy files to shared processing directory
        file_info = copy_files_to_processing_dir(scanpair, 'cbct')
        if not file_info:
            raise Exception("Failed to copy CBCT file to processing directory")
            
        processing_dir, cbct_file = file_info
        
        # Prepare Docker command
        # TODO: Replace 'your-cbct-processor:latest' with your actual Docker image
        command = [
            'docker', 'run', '--rm',
            '-v', f'{processing_dir}:/data',
            # Add GPU support if needed for CBCT processing
            # '--gpus', 'all',
            'your-cbct-processor:latest',  # Replace with your Docker image
            '--scanpair-id', str(scanpair.scanpair_id),
            '--patient-id', str(scanpair.patient.patient_id),
            '--cbct-file', f'/data/{os.path.basename(cbct_file)}',
            '--output-dir', '/data'
        ]
        
        print(f"Executing CBCT Docker command: {' '.join(command)}")
        
        # Execute the Docker command
        result = subprocess.run(command, capture_output=True, text=True, timeout=600)
        
        if result.returncode == 0:
            print(f"CBCT processing completed successfully for ScanPair {scanpair.scanpair_id}")
            # The actual processing script should update the status to 'processed'
            # For now, we'll do it here as a placeholder
            scanpair.cbct_processing_status = 'processed'
            scanpair.save()
            
            # Optional: Copy results back to Django storage
            # You can implement this based on your needs
            
            return True
        else:
            print(f"CBCT processing failed for ScanPair {scanpair.scanpair_id}: {result.stderr}")
            scanpair.cbct_processing_status = 'failed'
            scanpair.save()
            return False
            
    except subprocess.TimeoutExpired:
        print(f"CBCT processing timed out for ScanPair {scanpair.scanpair_id}")
        scanpair.cbct_processing_status = 'failed'
        scanpair.save()
        return False
    except Exception as e:
        print(f"Error executing CBCT processing command for ScanPair {scanpair.scanpair_id}: {e}")
        scanpair.cbct_processing_status = 'failed'
        scanpair.save()
        return False
    finally:
        # Cleanup: Remove processing directory
        if 'processing_dir' in locals():
            try:
                shutil.rmtree(processing_dir)
            except:
                pass 


def execute_speech_to_text_command(voice_caption):
    """
    Execute Docker command for speech-to-text processing
    """
    try:
        # Update status to processing
        voice_caption.processing_status = 'processing'
        voice_caption.save()
        
        # Copy audio file to shared processing directory
        processing_dir = f"/tmp/processing/voice_caption_{voice_caption.id}"
        os.makedirs(processing_dir, exist_ok=True)
        
        audio_dest = os.path.join(processing_dir, f"audio_{voice_caption.id}.webm")
        shutil.copy2(voice_caption.audio_file.path, audio_dest)
        
        # Prepare Docker command for speech-to-text
        # TODO: Replace 'your-speech-to-text:latest' with your actual Docker image
        command = [
            'docker', 'run', '--rm',
            '-v', f'{processing_dir}:/data',
            'your-speech-to-text:latest',  # Replace with your Docker image
            '--voice-caption-id', str(voice_caption.id),
            '--audio-file', f'/data/{os.path.basename(audio_dest)}',
            '--output-file', f'/data/transcription_{voice_caption.id}.txt',
            '--language', 'en',  # Default to English, could be configurable
            '--model', 'base'    # Whisper model size
        ]
        
        print(f"Executing speech-to-text Docker command: {' '.join(command)}")
        
        # Execute the Docker command
        result = subprocess.run(command, capture_output=True, text=True, timeout=300)
        
        if result.returncode == 0:
            # Read the transcription result
            transcription_file = os.path.join(processing_dir, f'transcription_{voice_caption.id}.txt')
            if os.path.exists(transcription_file):
                with open(transcription_file, 'r', encoding='utf-8') as f:
                    transcription = f.read().strip()
                
                # Update voice caption with transcription
                voice_caption.text_caption = transcription
                voice_caption.processing_status = 'completed'
                voice_caption.save()
                
                print(f"Speech-to-text processing completed successfully for VoiceCaption {voice_caption.id}")
                return True
            else:
                print(f"Transcription file not found for VoiceCaption {voice_caption.id}")
                voice_caption.processing_status = 'failed'
                voice_caption.save()
                return False
        else:
            print(f"Speech-to-text processing failed for VoiceCaption {voice_caption.id}: {result.stderr}")
            voice_caption.processing_status = 'failed'
            voice_caption.save()
            return False
            
    except subprocess.TimeoutExpired:
        print(f"Speech-to-text processing timed out for VoiceCaption {voice_caption.id}")
        voice_caption.processing_status = 'failed'
        voice_caption.save()
        return False
    except Exception as e:
        print(f"Error executing speech-to-text command for VoiceCaption {voice_caption.id}: {e}")
        voice_caption.processing_status = 'failed'
        voice_caption.save()
        return False
    finally:
        # Cleanup: Remove processing directory
        if 'processing_dir' in locals():
            try:
                shutil.rmtree(processing_dir)
            except:
                pass 