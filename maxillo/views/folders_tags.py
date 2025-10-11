"""Folder and tag management views."""
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required, user_passes_test
from django.contrib import messages
from django.http import JsonResponse, HttpResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
import json
import os
import logging

from ..models import Patient, Tag, Folder

logger = logging.getLogger(__name__)

@require_POST
def create_folder(request):
    """Create a folder (single-level only)."""
    try:
        data = json.loads(request.body) if request.body else request.POST
        name = (data.get('name') or '').strip()
        if not name:
            return JsonResponse({'error': 'Folder name is required'}, status=400)
        # Force single-level folders
        folder, created = Folder.objects.get_or_create(name=name, parent=None, defaults={'created_by': request.user})
        return JsonResponse({'success': True, 'folder': {'id': folder.id, 'name': folder.name, 'path': folder.name, 'created': created}})
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@login_required
@require_POST
def move_patients_to_folder(request):
    """Bulk move scans to a folder (or root if folder_id is null/root)"""
    try:
        data = json.loads(request.body) if request.body else request.POST
        scan_ids = data.get('scan_ids', [])
        folder_id = data.get('folder_id')
        if not isinstance(scan_ids, list) or not scan_ids:
            return JsonResponse({'error': 'scan_ids list is required'}, status=400)
        folder = None
        if folder_id and folder_id != 'root' and folder_id != 'all':
            folder = get_object_or_404(Folder, id=folder_id)
        # Permission: reuse visibility rules from list; only allow moving visible scans
        qs = Patient.objects.filter(patient_id__in=scan_ids)
        # Update folder
        updated = qs.update(folder=folder)
        return JsonResponse({'success': True, 'updated': updated})
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@login_required
@require_POST
@csrf_exempt
def add_patient_tag(request, patient_id):
    """Add a tag to a scan; creates tag if it doesn't exist."""
    try:
        scan_pair = get_object_or_404(Patient, patient_id=patient_id)
        user_profile = request.user.profile
        # Permissions aligned with management updates
        can_modify = user_profile.is_admin() or (user_profile.is_annotator() and scan_pair.visibility != 'debug') or (user_profile.is_student_developer() and scan_pair.visibility == 'debug')
        if not can_modify:
            return JsonResponse({'error': 'Permission denied'}, status=403)
        data = json.loads(request.body) if request.body else request.POST
        tag_name = (data.get('tag') or '').strip()
        if not tag_name:
            return JsonResponse({'error': 'Tag name required'}, status=400)
        tag, _ = Tag.objects.get_or_create(name=tag_name)
        scan_pair.tags.add(tag)
        return JsonResponse({'success': True, 'tags': scan_pair.tag_names()})
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@login_required
@require_POST
@csrf_exempt
def remove_patient_tag(request, patient_id):
    """Remove a tag from a scan by tag name or id."""
    try:
        scan_pair = get_object_or_404(Patient, patient_id=patient_id)
        user_profile = request.user.profile
        can_modify = user_profile.is_admin() or (user_profile.is_annotator() and scan_pair.visibility != 'debug') or (user_profile.is_student_developer() and scan_pair.visibility == 'debug')
        if not can_modify:
            return JsonResponse({'error': 'Permission denied'}, status=403)
        data = json.loads(request.body) if request.body else request.POST
        tag_name = (data.get('tag') or '').strip()
        tag_id = data.get('tag_id')
        tag = None
        if tag_id:
            tag = get_object_or_404(Tag, id=tag_id)
        elif tag_name:
            tag = Tag.objects.filter(name__iexact=tag_name).first()
        if not tag:
            return JsonResponse({'error': 'Tag not found'}, status=404)
        scan_pair.tags.remove(tag)
        return JsonResponse({'success': True, 'tags': scan_pair.tag_names()})
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


