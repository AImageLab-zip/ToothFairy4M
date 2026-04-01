#!/bin/bash
set -e

# Create export directory in /dataset/exports (ignore errors if permissions don't allow)
mkdir -p /dataset/exports 2>/dev/null || true
chmod 755 /dataset/exports 2>/dev/null || true

python manage.py collectstatic --noinput
python manage.py makemigrations
python manage.py migrate --fake-initial
# python manage.py collectstatic --noinput
python manage.py runserver 0.0.0.0:8000
