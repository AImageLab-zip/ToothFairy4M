"""Patient deletion views."""
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required, user_passes_test
from django.contrib import messages
from django.http import JsonResponse, HttpResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
import json
import os
import logging

from ..models import Patient

logger = logging.getLogger(__name__)
import shutil
from django.conf import settings

@login_required
def delete_patient(request, patient_id):
    return JsonResponse({
        'success': False, 
        'error': 'Deletion is disabled for this project.'
    }, status=403)
    """Delete a scan and all associated files"""
    try:
        patient = get_object_or_404(Patient, patient_id=patient_id)
        user_profile = request.user.profile
        
        # Check permissions based on scan type and user role
        can_delete = False
        if user_profile.is_admin():
            can_delete = True  # Admins can delete all scans
        elif user_profile.is_student_developer() and patient.visibility == 'debug':
            can_delete = True  # Student developers can only delete debug scans
        
        if not can_delete:
            return JsonResponse({
                'success': False, 
                'error': 'You do not have permission to delete this patient.'
            }, status=403)
        
        patient = patient
        
        # Delete all associated files from filesystem
        # Delete IOS files
        if patient.upper_scan_raw:
            try:
                os.remove(patient.upper_scan_raw.path)
            except:
                pass
        if patient.lower_scan_raw:
            try:
                os.remove(patient.lower_scan_raw.path)
            except:
                pass
        if patient.upper_scan_norm:
            try:
                os.remove(patient.upper_scan_norm.path)
            except:
                pass
        if patient.lower_scan_norm:
            try:
                os.remove(patient.lower_scan_norm.path)
            except:
                pass
                
        # Delete CBCT files
        if patient.cbct:
            try:
                os.remove(patient.cbct.path)
            except:
                pass
                
        # Delete from FileRegistry
        from common.models import FileRegistry
        file_entries = FileRegistry.objects.filter(patient=patient)
        for entry in file_entries:
            try:
                if os.path.exists(entry.file_path):
                    os.remove(entry.file_path)
            except:
                pass
        file_entries.delete()
        
        # Delete voice captions and their files
        for voice_caption in patient.voice_captions.all():
            # Delete associated files
            voice_files = FileRegistry.objects.filter(voice_caption=voice_caption)
            for file_entry in voice_files:
                try:
                    if os.path.exists(file_entry.file_path):
                        os.remove(file_entry.file_path)
                except:
                    pass
            voice_files.delete()
            
        # Delete the scan pair (this is the Patient instance; cascades classifications, voice captions, etc.)
        patient.delete()
        
        # Remove patient directory unconditionally for this patient
        patient_dir = os.path.join(settings.MEDIA_ROOT, 'scans', f'patient_{patient.patient_id}')
        if os.path.exists(patient_dir):
            shutil.rmtree(patient_dir, ignore_errors=True)
            
        messages.success(request, f'Patient {patient_id} and all associated data deleted successfully.')
        return JsonResponse({'success': True, 'message': 'Scan deleted successfully'})
        
    except Exception as e:
        logger.error(f"Error deleting scan {patient_id}: {e}")
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@login_required
def bulk_delete_patients(request):
    """Bulk delete multiple scans and all associated files"""
    try:
        data = json.loads(request.body) if request.body else request.POST
        scan_ids = data.get('scan_ids', [])
        
        if not isinstance(scan_ids, list) or not scan_ids:
            return JsonResponse({'error': 'scan_ids list is required'}, status=400)
        
        user_profile = request.user.profile
        
        # Check permissions - only admins can bulk delete
        if not user_profile.is_admin():
            return JsonResponse({
                'success': False, 
                'error': 'You do not have permission to bulk delete scans.'
            }, status=403)
        
        # Get the scans to delete
        scans_to_delete = Patient.objects.filter(patient_id__in=scan_ids)
        
        if not scans_to_delete.exists():
            return JsonResponse({'error': 'No valid scans found to delete'}, status=404)
        
        deleted_count = 0
        failed_deletions = []
        
        for scan_pair in scans_to_delete:
            try:
                patient = scan_pair
                
                # Delete all associated files from filesystem
                # Delete IOS files
                if scan_pair.upper_scan_raw:
                    try:
                        os.remove(scan_pair.upper_scan_raw.path)
                    except:
                        pass
                if scan_pair.lower_scan_raw:
                    try:
                        os.remove(scan_pair.lower_scan_raw.path)
                    except:
                        pass
                if scan_pair.upper_scan_norm:
                    try:
                        os.remove(scan_pair.upper_scan_norm.path)
                    except:
                        pass
                if scan_pair.lower_scan_norm:
                    try:
                        os.remove(scan_pair.lower_scan_norm.path)
                    except:
                        pass
                        
                # Delete CBCT files
                if scan_pair.cbct:
                    try:
                        os.remove(scan_pair.cbct.path)
                    except:
                        pass
                        
                # Delete from FileRegistry
                from common.models import FileRegistry
                file_entries = FileRegistry.objects.filter(patient=scan_pair)
                for entry in file_entries:
                    try:
                        if os.path.exists(entry.file_path):
                            os.remove(entry.file_path)
                    except:
                        pass
                file_entries.delete()
                
                # Delete voice captions and their files
                for voice_caption in scan_pair.voice_captions.all():
                    # Delete associated files
                    voice_files = FileRegistry.objects.filter(voice_caption=voice_caption)
                    for file_entry in voice_files:
                        try:
                            if os.path.exists(file_entry.file_path):
                                os.remove(file_entry.file_path)
                        except:
                            pass
                    voice_files.delete()
                    
                # Delete the scan pair (this is the Patient instance; cascades classifications, voice captions, etc.)
                scan_pair.delete()
                
                # Remove patient directory unconditionally for this patient
                patient_dir = os.path.join(settings.MEDIA_ROOT, 'scans', f'patient_{patient.patient_id}')
                if os.path.exists(patient_dir):
                    shutil.rmtree(patient_dir, ignore_errors=True)
                
                deleted_count += 1
                
            except Exception as e:
                logger.error(f"Error deleting scan {scan_pair.patient_id}: {e}")
                failed_deletions.append({
                    'patient_id': scan_pair.patient_id,
                    'error': str(e)
                })
        
        if failed_deletions:
            return JsonResponse({
                'success': True,
                'message': f'Successfully deleted {deleted_count} scans. {len(failed_deletions)} scans failed to delete.',
                'deleted_count': deleted_count,
                'failed_deletions': failed_deletions
            })
        else:
            return JsonResponse({
                'success': True,
                'message': f'Successfully deleted {deleted_count} scans and all associated data.',
                'deleted_count': deleted_count
            })
        
    except Exception as e:
        logger.error(f"Error in bulk delete: {e}")
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


