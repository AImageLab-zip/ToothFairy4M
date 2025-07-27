from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth import login, authenticate
from django.contrib.auth.decorators import login_required
from django.contrib.auth.forms import UserCreationForm
from django.contrib import messages
from django.http import JsonResponse, HttpResponse
from django.core.paginator import Paginator
from django.db.models import Q
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
from .models import Patient, ScanPair, Classification, UserProfile, Dataset
from .forms import PatientForm, ScanPairForm, ClassificationForm, ScanManagementForm
import json


def home(request):
    if request.user.is_authenticated:
        return redirect('scan_list')
    return render(request, 'scans/home.html')


def register(request):
    if request.method == 'POST':
        form = UserCreationForm(request.POST)
        if form.is_valid():
            user = form.save()
            username = form.cleaned_data.get('username')
            messages.success(request, f'Account created for {username}!')
            return redirect('login')
    else:
        form = UserCreationForm()
    return render(request, 'registration/register.html', {'form': form})


@login_required
def scan_list(request):
    user_profile = request.user.profile
    
    # Filter scans based on user role
    if user_profile.is_annotator():
        scans = ScanPair.objects.all()
    else:
        scans = ScanPair.objects.filter(visibility='public')
    
    # Get filter parameters
    search_query = request.GET.get('search', '').strip()
    status_filter = request.GET.get('status', '')
    visibility_filter = request.GET.get('visibility', '')
    uploader_filter = request.GET.get('uploader', '')
    annotator_filter = request.GET.get('annotator', '')
    date_from = request.GET.get('date_from', '')
    date_to = request.GET.get('date_to', '')
    
    # Apply basic filters
    if search_query:
        scans = scans.filter(
            Q(name__icontains=search_query) |
            Q(patient__patient_id__icontains=search_query) |
            Q(scanpair_id__icontains=search_query)
        )
    
    if visibility_filter:
        scans = scans.filter(visibility=visibility_filter)
    
    if uploader_filter:
        scans = scans.filter(uploaded_by__id=uploader_filter)
    
    if date_from:
        try:
            from datetime import datetime
            date_from_parsed = datetime.strptime(date_from, '%Y-%m-%d').date()
            scans = scans.filter(uploaded_at__date__gte=date_from_parsed)
        except ValueError:
            pass
    
    if date_to:
        try:
            from datetime import datetime
            date_to_parsed = datetime.strptime(date_to, '%Y-%m-%d').date()
            scans = scans.filter(uploaded_at__date__lte=date_to_parsed)
        except ValueError:
            pass
    
    # Prefetch classifications and prepare data
    scans = scans.prefetch_related(
        'classifications', 
        'uploaded_by', 
        'patient'
    ).select_related('dataset').order_by('-uploaded_at')
    
    # Prepare classification status for each scan
    scans_with_status = []
    for scan in scans:
        manual_classification = scan.classifications.filter(classifier='manual').first()
        ai_classification = scan.classifications.filter(classifier='pipeline').first()
        
        scan_data = {
            'scan': scan,
            'manual_classification': manual_classification,
            'ai_classification': ai_classification,
            'has_manual': manual_classification is not None,
            'has_ai_only': ai_classification is not None and manual_classification is None,
            'needs_processing': manual_classification is None and ai_classification is None,
        }
        scans_with_status.append(scan_data)
    
    # Apply status filter (after data preparation)
    if status_filter:
        if status_filter == 'verified':
            scans_with_status = [s for s in scans_with_status if s['has_manual']]
        elif status_filter == 'needs_review':
            scans_with_status = [s for s in scans_with_status if s['has_ai_only']]
        elif status_filter == 'processing':
            scans_with_status = [s for s in scans_with_status if s['needs_processing']]
    
    # Apply annotator filter (after data preparation)
    if annotator_filter:
        scans_with_status = [
            s for s in scans_with_status 
            if s['manual_classification'] and str(s['manual_classification'].annotator.id) == annotator_filter
        ]
    
    # Get filter options for dropdowns
    from django.contrib.auth.models import User
    uploaders = User.objects.filter(scanpair__isnull=False).distinct().order_by('username')
    annotators = User.objects.filter(
        profile__role__in=['annotator', 'admin'],
        classification__classifier='manual'
    ).distinct().order_by('username')
    
    # Pagination
    paginator = Paginator(scans_with_status, 20)  # More items per page for list view
    page_number = request.GET.get('page')
    page_obj = paginator.get_page(page_number)
    
    context = {
        'page_obj': page_obj,
        'search_query': search_query,
        'status_filter': status_filter,
        'visibility_filter': visibility_filter,
        'uploader_filter': uploader_filter,
        'annotator_filter': annotator_filter,
        'date_from': date_from,
        'date_to': date_to,
        'user_profile': user_profile,
        'uploaders': uploaders,
        'annotators': annotators,
    }
    return render(request, 'scans/scan_list.html', context)


@login_required
def upload_scan(request):
    user_profile = request.user.profile
    
    if not user_profile.is_annotator():
        messages.error(request, 'You do not have permission to upload scans.')
        return redirect('scan_list')
    
    if request.method == 'POST':
        patient_form = PatientForm(request.POST)
        scan_form = ScanPairForm(request.POST, request.FILES)
        
        if scan_form.is_valid():
            # Create patient first (no form data needed)
            patient = Patient.objects.create()
            
            scan_pair = scan_form.save(commit=False)
            scan_pair.patient = patient
            scan_pair.uploaded_by = request.user
            scan_pair.save()
            
            messages.success(request, 'Scan uploaded successfully! Processing will begin shortly.')
            return redirect('scan_detail', scanpair_id=scan_pair.scanpair_id)
    else:
        patient_form = PatientForm()
        scan_form = ScanPairForm()
    
    context = {
        'patient_form': patient_form,
        'scan_form': scan_form,
    }
    return render(request, 'scans/upload_scan.html', context)


@login_required
def scan_detail(request, scanpair_id):
    scan_pair = get_object_or_404(ScanPair, scanpair_id=scanpair_id)
    user_profile = request.user.profile
    
    # Check permissions
    if not user_profile.is_annotator() and scan_pair.visibility == 'private':
        messages.error(request, 'You do not have permission to view this scan.')
        return redirect('scan_list')
    
    # Get AI and manual classifications
    ai_classification = scan_pair.classifications.filter(classifier='pipeline').first()
    manual_classification = scan_pair.classifications.filter(classifier='manual').first()
    
    # Initialize scan management form
    management_form = ScanManagementForm(instance=scan_pair)
    
    # Handle POST requests
    if request.method == 'POST' and user_profile.is_annotator():
        action = request.POST.get('action')
        
        if action == 'accept_ai' and ai_classification:
            # Create manual classification based on AI prediction
            Classification.objects.create(
                scanpair=scan_pair,
                classifier='manual',
                sagittal_left=ai_classification.sagittal_left,
                sagittal_right=ai_classification.sagittal_right,
                vertical=ai_classification.vertical,
                transverse=ai_classification.transverse,
                midline=ai_classification.midline,
                annotator=request.user
            )
            messages.success(request, 'AI classification accepted!')
            return redirect('scan_detail', scanpair_id=scanpair_id)
        
        elif action == 'update_management':
            # Handle scan management updates (visibility and dataset)
            management_form = ScanManagementForm(request.POST, instance=scan_pair)
            if management_form.is_valid():
                management_form.save()
                messages.success(request, 'Scan settings updated successfully!')
                return redirect('scan_detail', scanpair_id=scanpair_id)
    
    context = {
        'scan_pair': scan_pair,
        'ai_classification': ai_classification,
        'manual_classification': manual_classification,
        'user_profile': user_profile,
        'management_form': management_form,
    }
    return render(request, 'scans/scan_detail.html', context)


@login_required
@require_POST
@csrf_exempt
def update_classification(request, scanpair_id):
    """AJAX endpoint for instant classification updates"""
    if not request.user.profile.is_annotator():
        return JsonResponse({'error': 'Permission denied'}, status=403)
    
    try:
        scan_pair = get_object_or_404(ScanPair, scanpair_id=scanpair_id)
        data = json.loads(request.body)
        
        field = data.get('field')
        value = data.get('value')
        
        # Validate field and value
        valid_fields = ['sagittal_left', 'sagittal_right', 'vertical', 'transverse', 'midline']
        if field not in valid_fields:
            return JsonResponse({'error': 'Invalid field'}, status=400)
        
        # Get or create manual classification
        manual_classification, created = Classification.objects.get_or_create(
            scanpair=scan_pair,
            classifier='manual',
            defaults={
                'annotator': request.user,
                'sagittal_left': 'I',
                'sagittal_right': 'I', 
                'vertical': 'normal',
                'transverse': 'normal',
                'midline': 'centered'
            }
        )
        
        # If created, copy AI values as defaults
        if created:
            ai_classification = scan_pair.classifications.filter(classifier='pipeline').first()
            if ai_classification:
                manual_classification.sagittal_left = ai_classification.sagittal_left
                manual_classification.sagittal_right = ai_classification.sagittal_right
                manual_classification.vertical = ai_classification.vertical
                manual_classification.transverse = ai_classification.transverse
                manual_classification.midline = ai_classification.midline
        
        # Update the specific field
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


@login_required
@require_POST
@csrf_exempt
def update_scan_name(request, scanpair_id):
    """AJAX endpoint for updating scan name"""
    if not request.user.profile.is_annotator():
        return JsonResponse({'error': 'Permission denied'}, status=403)
    
    try:
        scan_pair = get_object_or_404(ScanPair, scanpair_id=scanpair_id)
        data = json.loads(request.body)
        
        new_name = data.get('name', '').strip()
        if not new_name:
            return JsonResponse({'error': 'Name cannot be empty'}, status=400)
        
        scan_pair.name = new_name
        scan_pair.save()
        
        return JsonResponse({'success': True, 'name': new_name})
        
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@login_required
def scan_viewer_data(request, scanpair_id):
    """API endpoint to provide scan data for 3D viewer"""
    scan_pair = get_object_or_404(ScanPair, scanpair_id=scanpair_id)
    user_profile = request.user.profile
    
    # Check permissions
    if not user_profile.is_annotator() and scan_pair.visibility == 'private':
        return JsonResponse({'error': 'Permission denied'}, status=403)
    
    # Use normalized scans if available, otherwise raw scans
    upper_scan = scan_pair.upper_scan_norm.url if scan_pair.upper_scan_norm else scan_pair.upper_scan_raw.url
    lower_scan = scan_pair.lower_scan_norm.url if scan_pair.lower_scan_norm else scan_pair.lower_scan_raw.url
    
    data = {
        'upper_scan_url': request.build_absolute_uri(upper_scan),
        'lower_scan_url': request.build_absolute_uri(lower_scan),
        'patient_info': {
            'patient_id': scan_pair.patient.patient_id,
        }
    }
    
    return JsonResponse(data)
