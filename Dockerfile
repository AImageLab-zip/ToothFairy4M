FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    pkg-config \
    default-libmysqlclient-dev \
    build-essential \
    curl \
    ca-certificates \
    gnupg \
    lsb-release \
    && rm -rf /var/lib/apt/lists/*

# Install Docker CLI
RUN curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
RUN echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/debian $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
RUN apt-get update && apt-get install -y docker-ce-cli && rm -rf /var/lib/apt/lists/*

# Add docker group (GID should match host docker group)
RUN groupadd -g 999 docker || true

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Create processing directory
RUN mkdir -p /tmp/processing

# Create dataset directory structure
RUN mkdir -p \
    /dataset/brain/processed/braintumor-mri-flair \
    /dataset/brain/processed/braintumor-mri-t1 \
    /dataset/brain/processed/braintumor-mri-t1c \
    /dataset/brain/processed/braintumor-mri-t2 \
    /dataset/brain/processed/cbct \
    /dataset/brain/raw/braintumor-mri-flair \
    /dataset/brain/raw/braintumor-mri-t1 \
    /dataset/brain/raw/braintumor-mri-t1c \
    /dataset/brain/raw/braintumor-mri-t2 \
    /dataset/brain/raw/cbct \
    /dataset/maxillo/processed/audio \
    /dataset/maxillo/processed/bite \
    /dataset/maxillo/processed/cbct \
    /dataset/maxillo/processed/intraoral \
    /dataset/maxillo/processed/ios \
    /dataset/maxillo/processed/panoramic \
    /dataset/maxillo/processed/panoramich \
    /dataset/maxillo/processed/rawzip \
    /dataset/maxillo/processed/teleradiography \
    /dataset/maxillo/raw/audio \
    /dataset/maxillo/raw/cbct \
    /dataset/maxillo/raw/intraoral \
    /dataset/maxillo/raw/ios \
    /dataset/maxillo/raw/panoramic \
    /dataset/maxillo/raw/panoramich \
    /dataset/maxillo/raw/rawzip \
    /dataset/maxillo/raw/rgb \
    /dataset/maxillo/raw/teleradiography

EXPOSE 8000

CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"] 