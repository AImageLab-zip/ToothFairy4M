#!/bin/bash

# Setup script for Docker-in-Docker functionality
# This script prepares the environment for running Docker containers from within Django

echo "🐳 Setting up Docker-in-Docker for ToothFairy4M..."

# Check if Docker is installed on host
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed on the host machine. Please install Docker first."
    exit 1
fi

# Get Docker group ID from host
DOCKER_GID=$(getent group docker | cut -d: -f3)
if [ -z "$DOCKER_GID" ]; then
    echo "❌ Docker group not found on host. Make sure Docker is properly installed."
    exit 1
fi

echo "✅ Docker group ID: $DOCKER_GID"

# Set environment variables for docker-compose
export UID=$(id -u)
export GID=$(id -g)
export DOCKER_GID=$DOCKER_GID

echo "✅ Environment variables set:"
echo "   UID=$UID"
echo "   GID=$GID" 
echo "   DOCKER_GID=$DOCKER_GID"

# Create processing directory on host
sudo mkdir -p /tmp/toothfairy-processing
sudo chown $UID:$GID /tmp/toothfairy-processing
echo "✅ Created processing directory: /tmp/toothfairy-processing"

# Update docker-compose.yml with correct Docker group ID
sed -i "s/group_add:/group_add:\n      - $DOCKER_GID/" docker-compose.yml

# Build and start containers
echo "🏗️  Building and starting containers..."
docker-compose build
docker-compose up -d

echo "🎉 Setup complete!"
echo ""
echo "📝 Next steps:"
echo "1. Build your processing Docker images (see README-DOCKER.md)"
echo "2. Update the image names in scans/processing.py"
echo "3. Test the processing pipeline"
echo ""
echo "🔍 Check container logs:"
echo "   docker-compose logs -f web"
echo ""
echo "🛑 Stop containers:"
echo "   docker-compose down" 