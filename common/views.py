from django.contrib.auth.decorators import login_required, user_passes_test
from django.shortcuts import render, redirect
from django.conf import settings
from django.contrib.auth.models import User
from django.db.models import Count, Q
from django.utils.text import slugify

import os
import shutil

from .models import Job, ProcessingJob, Project, ProjectAccess, Modality


def _format_bytes(num_bytes: int) -> str:
	units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
	value = float(num_bytes)
	unit_idx = 0
	while value >= 1024 and unit_idx < len(units) - 1:
		value /= 1024.0
		unit_idx += 1
	return f"{value:.1f} {units[unit_idx]}"


@login_required
@user_passes_test(lambda u: u.profile.is_admin)
def admin_control_panel(request):
	"""App-agnostic admin control panel with aggregated metrics."""
	# Dataset storage usage
	dataset_path = getattr(settings, 'DATASET_PATH', '/dataset')
	dataset_usage = None
	if os.path.exists(dataset_path):
		total, used, free = shutil.disk_usage(dataset_path)
		dataset_usage = {
			'total_bytes': int(total),
			'used_bytes': int(used),
			'free_bytes': int(free),
			'total_h': _format_bytes(total),
			'used_h': _format_bytes(used),
			'free_h': _format_bytes(free),
			'percent_used': (used / total * 100.0) if total else 0.0,
		}

	# Job counts (aggregate across Job and ProcessingJob)
	job_counts = {
		'pending': 0,
		'processing': 0,
		'completed': 0,
		'failed': 0,
	}

	# Aggregate from Job
	job_agg = Job.objects.aggregate(
		pending=Count('id', filter=Q(status='pending')),
		processing=Count('id', filter=Q(status='processing')),
		completed=Count('id', filter=Q(status='completed')),
		failed=Count('id', filter=Q(status='failed')),
	)
	for k in job_counts.keys():
		job_counts[k] += job_agg.get(k, 0) or 0

	# Aggregate from ProcessingJob
	proc_agg = ProcessingJob.objects.aggregate(
		pending=Count('id', filter=Q(status='pending')),
		processing=Count('id', filter=Q(status='processing')),
		completed=Count('id', filter=Q(status='completed')),
		failed=Count('id', filter=Q(status='failed')),
	)
	for k in job_counts.keys():
		job_counts[k] += proc_agg.get(k, 0) or 0

	job_counts['total'] = sum(job_counts.values())

	# Users
	user_count = User.objects.count()

	# Pending jobs per modality (iterate all modalities)
	pending_by_modality = []
	for modality in Modality.objects.order_by('name'):
		slug = modality.slug or slugify(modality.name)
		pending_jobs = (
			Job.objects.filter(modality_slug=slug, status='pending').count()
			+ ProcessingJob.objects.filter(job_type=slug, status='pending').count()
		)
		pending_by_modality.append({
			'slug': slug,
			'name': modality.name,
			'pending': pending_jobs,
		})

	# Users per project (aggregated)
	projects_with_counts = Project.objects.annotate(
		num_users=Count('access_list__user', distinct=True)
	).order_by('name')

	project_user_list = []
	for project in projects_with_counts:
		usernames = list(
			User.objects.filter(project_access__project=project)
			.values_list('username', flat=True)
			.order_by('username')
		)
		project_user_list.append({
			'project_id': project.id,
			'project_name': project.name,
			'num_users': project.num_users,
			'usernames': usernames,
		})

	context = {
		'dataset_usage': dataset_usage,
		'job_counts': job_counts,
		'pending_by_modality': pending_by_modality,
		'user_count': user_count,
		'project_user_list': project_user_list,
	}
	return render(request, 'common/admin_control_panel.html', context)


