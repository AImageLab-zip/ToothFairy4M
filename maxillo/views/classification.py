"""Classification update views."""
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required, user_passes_test
from django.contrib import messages
from django.http import JsonResponse, HttpResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
import json
import os
import logging

from ..models import Patient, Classification

logger = logging.getLogger(__name__)


@login_required
@require_POST
@csrf_exempt
def update_classification(request, patient_id):
    """AJAX endpoint for instant classification updates"""
    user_profile = request.user.profile
    
    try:
        scan_pair = get_object_or_404(Patient, patient_id=patient_id)
        
        can_classify = False
        if user_profile.is_admin():
            can_classify = True
        elif user_profile.is_annotator() and scan_pair.visibility != 'debug':
            can_classify = True
        elif user_profile.is_student_developer() and scan_pair.visibility == 'debug':
            can_classify = True
        
        if not can_classify:
            return JsonResponse({'error': 'Permission denied'}, status=403)
        data = json.loads(request.body)
        
        field = data.get('field')
        value = data.get('value')
        
        valid_fields = ['sagittal_left', 'sagittal_right', 'vertical', 'transverse', 'midline']
        if field not in valid_fields:
            return JsonResponse({'error': 'Invalid field'}, status=400)
        
        manual_classification, created = Classification.objects.get_or_create(
            patient=scan_pair,
            classifier='manual',
            defaults={
                'sagittal_left': 'Unknown',
                'sagittal_right': 'Unknown',
                'vertical': 'Unknown',
                'transverse': 'Unknown',
                'midline': 'Unknown',
                'annotator': request.user,
            }
        )
        
        if created:
            ai_classification = scan_pair.classifications.filter(classifier='pipeline').first()
            if ai_classification:
                manual_classification.sagittal_left = ai_classification.sagittal_left
                manual_classification.sagittal_right = ai_classification.sagittal_right
                manual_classification.vertical = ai_classification.vertical
                manual_classification.transverse = ai_classification.transverse
                manual_classification.midline = ai_classification.midline
        
        setattr(manual_classification, field, value)
        manual_classification.save()
        
        return JsonResponse({
            'success': True,
            'field': field,
            'value': value,
            'display_value': getattr(manual_classification, f'get_{field}_display')()
        })
        
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)
