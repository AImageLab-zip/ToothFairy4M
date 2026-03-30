from django.shortcuts import render, redirect
from django.conf import settings
from django.contrib.auth.models import User
from django.db.models import Count, Q
from django.db import connection
from django.utils.text import slugify
from django.utils import timezone

import os
import shutil
import json
from datetime import datetime, timezone as dt_timezone

from .models import Job, ProcessingJob, Project, ProjectAccess, Modality


def _format_bytes(num_bytes: int) -> str:
	units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
	value = float(num_bytes)
	unit_idx = 0
	while value >= 1024 and unit_idx < len(units) - 1:
		value /= 1024.0
		unit_idx += 1
	return f"{value:.1f} {units[unit_idx]}"


def _format_age(delta_seconds: float) -> str:
	seconds = max(0, int(delta_seconds))
	days, rem = divmod(seconds, 86400)
	hours, rem = divmod(rem, 3600)
	minutes, _ = divmod(rem, 60)
	if days:
		return f"{days}d {hours}h ago"
	if hours:
		return f"{hours}h {minutes}m ago"
	return f"{minutes}m ago"


def _parse_iso_datetime(value: str):
	if not value:
		return None
	try:
		dt = datetime.fromisoformat(value.replace('Z', '+00:00'))
		if dt.tzinfo is None:
			dt = dt.replace(tzinfo=dt_timezone.utc)
		return dt
	except Exception:
		return None


def _database_health():
	try:
		with connection.cursor() as cursor:
			cursor.execute('SELECT 1')
			cursor.fetchone()
		return {'status': 'up', 'message': 'Connected'}
	except Exception as exc:
		return {'status': 'down', 'message': str(exc)}


def _memory_health():
	try:
		with open('/proc/meminfo', 'r', encoding='utf-8') as f:
			meminfo = f.read().splitlines()
		values = {}
		for line in meminfo:
			if ':' not in line:
				continue
			key, raw = line.split(':', 1)
			parts = raw.strip().split()
			if not parts:
				continue
			values[key] = int(parts[0]) * 1024  # kB -> bytes
		total = values.get('MemTotal')
		available = values.get('MemAvailable')
		if not total or available is None:
			return None
		used = total - available
		percent = (used / total * 100.0) if total else 0.0
		return {
			'total_h': _format_bytes(total),
			'used_h': _format_bytes(used),
			'percent_used': percent,
		}
	except Exception:
		return None


def _uptime_health():
	try:
		with open('/proc/uptime', 'r', encoding='utf-8') as f:
			uptime_seconds = float(f.read().split()[0])
		return {
			'seconds': int(uptime_seconds),
			'human': _format_age(uptime_seconds).replace(' ago', ''),
		}
	except Exception:
		return None


def _load_health():
	try:
		one, five, fifteen = os.getloadavg()
		return {'one': one, 'five': five, 'fifteen': fifteen}
	except Exception:
		return None


def _disk_health(paths):
	items = []
	seen = set()
	for label, path in paths:
		if path in seen or not path:
			continue
		seen.add(path)
		if not os.path.exists(path):
			items.append({
				'label': label,
				'path': path,
				'available': False,
			})
			continue
		total, used, free = shutil.disk_usage(path)
		items.append({
			'label': label,
			'path': path,
			'available': True,
			'total_h': _format_bytes(total),
			'used_h': _format_bytes(used),
			'free_h': _format_bytes(free),
			'percent_used': (used / total * 100.0) if total else 0.0,
		})
	return items


def _backup_health(status_file='/dataset/.health/borg_status.json'):
	warn_hours = 30
	critical_hours = 54
	now = timezone.now()

	if not os.path.exists(status_file):
		return {
			'status': 'unknown',
			'label': 'Unknown',
			'message': f'No Borg heartbeat at {status_file}',
		}

	try:
		with open(status_file, 'r', encoding='utf-8') as f:
			data = json.load(f)
	except Exception as exc:
		return {
			'status': 'unknown',
			'label': 'Unknown',
			'message': f'Cannot read Borg heartbeat: {exc}',
		}

	last_success = _parse_iso_datetime(data.get('last_success'))
	last_run = _parse_iso_datetime(data.get('last_run'))
	last_result = data.get('last_result')

	if last_result == 'failed' and last_run:
		return {
			'status': 'down',
			'label': 'Down',
			'last_run': last_run,
			'last_run_h': _format_age((now - last_run).total_seconds()),
			'message': data.get('error', 'Last backup run failed'),
		}

	if not last_success:
		return {
			'status': 'unknown',
			'label': 'Unknown',
			'message': 'No successful backup timestamp in heartbeat file',
		}

	age_seconds = (now - last_success).total_seconds()
	age_hours = age_seconds / 3600.0
	if age_hours > critical_hours:
		status = 'down'
		label = 'Down'
		message = f'Last successful backup is stale ({_format_age(age_seconds)})'
	elif age_hours > warn_hours:
		status = 'warn'
		label = 'Warning'
		message = f'Last successful backup is older than {warn_hours}h'
	else:
		status = 'up'
		label = 'Up'
		message = 'Backups are recent'

	return {
		'status': status,
		'label': label,
		'message': message,
		'last_success': last_success,
		'last_success_h': _format_age(age_seconds),
		'archive': data.get('last_archive'),
		'repo': data.get('repo'),
	}


def admin_control_panel(request):
	"""App-agnostic admin control panel with aggregated metrics."""
	media_root = str(getattr(settings, 'MEDIA_ROOT', ''))
	system_health = {
		'backup': _backup_health(),
		'database': _database_health(),
		'uptime': _uptime_health(),
		'load': _load_health(),
		'memory': _memory_health(),
		'disks': _disk_health([
			('Root', '/'),
			('Dataset', getattr(settings, 'DATASET_PATH', '/dataset')),
			('Storage', media_root),
		]),
		'checked_at': timezone.now(),
	}

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
		'system_health': system_health,
		'dataset_usage': dataset_usage,
		'job_counts': job_counts,
		'pending_by_modality': pending_by_modality,
		'user_count': user_count,
		'project_user_list': project_user_list,
	}
	return render(request, 'common/admin_control_panel.html', context)
