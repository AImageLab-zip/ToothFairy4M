#!/bin/bash
set -e

DIRS="
/dataset/brain/processed/braintumor-mri-flair
/dataset/brain/processed/braintumor-mri-t1
/dataset/brain/processed/braintumor-mri-t1c
/dataset/brain/processed/braintumor-mri-t2
/dataset/brain/processed/cbct
/dataset/brain/raw/braintumor-mri-flair
/dataset/brain/raw/braintumor-mri-t1
/dataset/brain/raw/braintumor-mri-t1c
/dataset/brain/raw/braintumor-mri-t2
/dataset/brain/raw/cbct
/dataset/maxillo/processed/audio
/dataset/maxillo/processed/bite
/dataset/maxillo/processed/cbct
/dataset/maxillo/processed/intraoral
/dataset/maxillo/processed/ios
/dataset/maxillo/processed/panoramic
/dataset/maxillo/processed/panoramich
/dataset/maxillo/processed/rawzip
/dataset/maxillo/processed/teleradiography
/dataset/maxillo/raw/audio
/dataset/maxillo/raw/cbct
/dataset/maxillo/raw/intraoral
/dataset/maxillo/raw/ios
/dataset/maxillo/raw/panoramic
/dataset/maxillo/raw/panoramich
/dataset/maxillo/raw/rawzip
/dataset/maxillo/raw/rgb
/dataset/maxillo/raw/teleradiography
"

for d in $DIRS; do
    mkdir -p "$d"
done

mkdir -p /app/logs

python manage.py migrate
python manage.py runserver 0.0.0.0:8000
