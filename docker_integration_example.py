#!/usr/bin/env python3
"""
Example script showing how Docker containers should interact with the new processing API.

This script demonstrates the workflow that your existing Docker containers 
should follow to poll for jobs and update their status.

Usage examples:
- CBCT processor: python docker_integration_example.py --job-type cbct --worker-id cbct-worker-1
- IOS processor: python docker_integration_example.py --job-type ios --worker-id ios-worker-1  
- Audio processor: python docker_integration_example.py --job-type audio --worker-id audio-worker-1
"""

import requests
import time
import sys
import argparse
import json
import os
import subprocess
from pathlib import Path


# Configuration - can be overridden by environment variables
WEBAPP_BASE_URL = os.getenv("WEBAPP_BASE_URL", "http://localhost:8000")  # Django webapp URL
DATASET_ROOT = "/dataset"  # Container path where dataset is mounted (consistent across all containers)
POLL_INTERVAL = int(os.getenv("POLL_INTERVAL", "60"))  # Poll interval in seconds


class ProcessingWorker:
    def __init__(self, job_type, worker_id, base_url=WEBAPP_BASE_URL):
        self.job_type = job_type
        self.worker_id = worker_id
        self.base_url = base_url.rstrip('/')
        
    def get_pending_jobs(self):
        """Get pending jobs for this worker's job type"""
        url = f"{self.base_url}/api/processing/jobs/pending/{self.job_type}/"
        
        try:
            response = requests.get(url, timeout=30)
            response.raise_for_status()
            data = response.json()
            
            if data.get('success'):
                return data.get('jobs', [])
            else:
                print(f"API error: {data.get('error', 'Unknown error')}")
                return []
                
        except requests.exceptions.RequestException as e:
            print(f"Failed to get pending jobs: {e}")
            return []
    
    def mark_job_processing(self, job_id):
        """Mark a job as being processed by this worker"""
        url = f"{self.base_url}/api/processing/jobs/{job_id}/processing/"
        
        payload = {
            'worker_id': self.worker_id
        }
        
        try:
            response = requests.post(url, json=payload, timeout=30)
            response.raise_for_status()
            data = response.json()
            
            if data.get('success'):
                print(f"Job {job_id} marked as processing by {self.worker_id}")
                return True
            else:
                print(f"Failed to mark job {job_id} as processing: {data.get('error')}")
                return False
                
        except requests.exceptions.RequestException as e:
            print(f"Failed to mark job {job_id} as processing: {e}")
            return False
    
    def mark_job_completed(self, job_id, output_files, logs=None):
        """Mark a job as completed with output files"""
        url = f"{self.base_url}/api/processing/jobs/{job_id}/completed/"
        
        payload = {
            'output_files': output_files,
            'logs': logs
        }
        
        try:
            response = requests.post(url, json=payload, timeout=30)
            response.raise_for_status()
            data = response.json()
            
            if data.get('success'):
                print(f"Job {job_id} marked as completed")
                return True
            else:
                print(f"Failed to mark job {job_id} as completed: {data.get('error')}")
                return False
                
        except requests.exceptions.RequestException as e:
            print(f"Failed to mark job {job_id} as completed: {e}")
            return False
    
    def mark_job_failed(self, job_id, error_msg, can_retry=True):
        """Mark a job as failed"""
        url = f"{self.base_url}/api/processing/jobs/{job_id}/failed/"
        
        payload = {
            'error_msg': error_msg,
            'can_retry': can_retry
        }
        
        try:
            response = requests.post(url, json=payload, timeout=30)
            response.raise_for_status()
            data = response.json()
            
            if data.get('success'):
                print(f"Job {job_id} marked as failed: {error_msg}")
                return True
            else:
                print(f"Failed to mark job {job_id} as failed: {data.get('error')}")
                return False
                
        except requests.exceptions.RequestException as e:
            print(f"Failed to mark job {job_id} as failed: {e}")
            return False
    
    def process_cbct_job(self, job):
        """Process a CBCT job"""
        job_id = job['id']
        input_file = job['input_file_path']
        scanpair_id = job['scanpair_id']
        patient_id = job['patient_id']
        
        print(f"Processing CBCT job {job_id}: {input_file}")
        
        # Generate output filename - following your desired format
        input_name = Path(input_file).stem  # removes extension
        output_filename = f"{input_name}_processed.nii.gz"
        output_path = os.path.join(f"{DATASET_ROOT}/processed/cbct", output_filename)
        
        try:
            # NOTE: When running in Docker Compose, you would replace this Docker-in-Docker
            # approach with your actual processing logic directly in this container.
            # This example shows Docker-in-Docker for standalone usage.
            
            # For Docker Compose: Replace this entire section with your processing code
            # e.g., import your_cbct_processor; your_cbct_processor.process(input_file, output_path)
            
            command = [
                'docker', 'run', '--rm',
                '-v', f'{DATASET_ROOT}:/dataset',  # Dataset is already mounted in Docker Compose
                'your-cbct-processor:latest',
                '--input', input_file,
                '--output', output_path,
                '--scanpair-id', str(scanpair_id),
                '--patient-id', str(patient_id)
            ]
            
            print(f"Running command: {' '.join(command)}")
            result = subprocess.run(command, capture_output=True, text=True, timeout=1800)  # 30 min timeout
            
            if result.returncode == 0:
                # Success - mark as completed
                output_files = {
                    'processed_cbct': output_path
                }
                self.mark_job_completed(job_id, output_files, result.stdout)
            else:
                # Failed
                error_msg = f"Processing failed with return code {result.returncode}: {result.stderr}"
                self.mark_job_failed(job_id, error_msg)
                
        except subprocess.TimeoutExpired:
            error_msg = "Processing timed out after 30 minutes"
            self.mark_job_failed(job_id, error_msg)
        except Exception as e:
            error_msg = f"Processing failed with exception: {str(e)}"
            self.mark_job_failed(job_id, error_msg)
    
    def process_ios_job(self, job):
        """Process an IOS job"""
        job_id = job['id']
        input_files_json = job['input_file_path']  # JSON string for IOS jobs
        scanpair_id = job['scanpair_id']
        patient_id = job['patient_id']
        
        print(f"Processing IOS job {job_id}")
        
        try:
            input_files = json.loads(input_files_json)
            
            # Generate output filenames
            output_files = {}
            for scan_type, input_path in input_files.items():
                input_name = Path(input_path).stem
                output_filename = f"{input_name}_processed.stl"
                output_path = os.path.join(f"{DATASET_ROOT}/processed/ios", output_filename)
                output_files[scan_type] = output_path
            
            # Your actual processing command
            command = [
                'docker', 'run', '--rm',
                '-v', f'{DATASET_ROOT}:/dataset',
                'your-ios-processor:latest',
                '--input-files', json.dumps(input_files),
                '--output-dir', f'{DATASET_ROOT}/processed/ios',
                '--scanpair-id', str(scanpair_id),
                '--patient-id', str(patient_id)
            ]
            
            print(f"Running command: {' '.join(command)}")
            result = subprocess.run(command, capture_output=True, text=True, timeout=1800)
            
            if result.returncode == 0:
                self.mark_job_completed(job_id, output_files, result.stdout)
            else:
                error_msg = f"Processing failed with return code {result.returncode}: {result.stderr}"
                self.mark_job_failed(job_id, error_msg)
                
        except Exception as e:
            error_msg = f"Processing failed with exception: {str(e)}"
            self.mark_job_failed(job_id, error_msg)
    
    def process_audio_job(self, job):
        """Process an audio job (speech-to-text)"""
        job_id = job['id']
        input_file = job['input_file_path']
        voice_caption_id = job['voice_caption_id']
        
        print(f"Processing audio job {job_id}: {input_file}")
        
        # Generate output filename
        input_name = Path(input_file).stem
        output_filename = f"{input_name}_transcription.txt"
        output_path = os.path.join(f"{DATASET_ROOT}/processed/audio", output_filename)
        
        try:
            # Your actual speech-to-text command
            command = [
                'docker', 'run', '--rm',
                '-v', f'{DATASET_ROOT}:/dataset',
                'your-speech-to-text:latest',
                '--input', input_file,
                '--output', output_path,
                '--voice-caption-id', str(voice_caption_id),
                '--language', 'en',
                '--model', 'base'
            ]
            
            print(f"Running command: {' '.join(command)}")
            result = subprocess.run(command, capture_output=True, text=True, timeout=600)  # 10 min timeout
            
            if result.returncode == 0:
                output_files = {
                    'transcription': output_path
                }
                self.mark_job_completed(job_id, output_files, result.stdout)
            else:
                error_msg = f"Processing failed with return code {result.returncode}: {result.stderr}"
                self.mark_job_failed(job_id, error_msg)
                
        except subprocess.TimeoutExpired:
            error_msg = "Processing timed out after 10 minutes"
            self.mark_job_failed(job_id, error_msg)
        except Exception as e:
            error_msg = f"Processing failed with exception: {str(e)}"
            self.mark_job_failed(job_id, error_msg)
    
    def process_job(self, job):
        """Process a job based on its type"""
        job_id = job['id']
        
        # Mark job as processing
        if not self.mark_job_processing(job_id):
            return  # Failed to claim the job
        
        # Process based on job type
        try:
            if self.job_type == 'cbct':
                self.process_cbct_job(job)
            elif self.job_type == 'ios':
                self.process_ios_job(job)
            elif self.job_type == 'audio':
                self.process_audio_job(job)
            else:
                raise ValueError(f"Unknown job type: {self.job_type}")
                
        except Exception as e:
            # If something goes wrong, mark as failed
            error_msg = f"Unexpected error processing job: {str(e)}"
            self.mark_job_failed(job_id, error_msg)
    
    def run(self):
        """Main worker loop"""
        print(f"Starting {self.job_type} worker: {self.worker_id}")
        print(f"Polling interval: {POLL_INTERVAL} seconds")
        
        while True:
            try:
                # Get pending jobs
                jobs = self.get_pending_jobs()
                
                if jobs:
                    print(f"Found {len(jobs)} pending {self.job_type} job(s)")
                    
                    # Process each job
                    for job in jobs:
                        self.process_job(job)
                        
                else:
                    print(f"No pending {self.job_type} jobs found")
                
                # Wait before next poll
                time.sleep(POLL_INTERVAL)
                
            except KeyboardInterrupt:
                print(f"\nShutting down {self.job_type} worker: {self.worker_id}")
                break
            except Exception as e:
                print(f"Error in main loop: {e}")
                time.sleep(30)  # Wait 30 seconds before retrying


def main():
    parser = argparse.ArgumentParser(description='Processing worker for Docker containers')
    parser.add_argument('--job-type', required=True, choices=['cbct', 'ios', 'audio'],
                       help='Type of jobs to process')
    parser.add_argument('--worker-id', required=True,
                       help='Unique identifier for this worker')
    parser.add_argument('--base-url', default=WEBAPP_BASE_URL,
                       help='Base URL of the Django webapp')
    parser.add_argument('--poll-interval', type=int, default=POLL_INTERVAL,
                       help='Polling interval in seconds')
    
    args = parser.parse_args()
    
    # Update global config
    global POLL_INTERVAL
    POLL_INTERVAL = args.poll_interval
    
    # Create and run worker
    worker = ProcessingWorker(args.job_type, args.worker_id, args.base_url)
    worker.run()


if __name__ == '__main__':
    main() 