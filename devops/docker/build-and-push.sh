#!/usr/bin/env bash

# Exit immediately if any command fails
set -e

# Load variables from .env if it exists
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

# Configuration
DEFAULT_HUB_USER="khmersoftware"
DOCKER_HUB_USER="${DOCKER_HUB_USERNAME:-$DEFAULT_HUB_USER}"

echo "======================================================================"
echo "Starting build and push for user: ${DOCKER_HUB_USER}"
echo "======================================================================"

# Ensure we are in the correct directory (devops/docker)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# List of services to build and push
# Format: "directory_path|dockerfile_path|image_suffix"
SERVICES=(
  "../../backend/infrastructure/auth-server|Dockerfile|auth-server"
  "../../backend/infrastructure/gateway|Dockerfile|gateway"
  "../../backend/services/branchreport-service|Dockerfile|branchreport-service"
  "../../backend/services/call-service|Dockerfile|call-service"
  "../../backend/services/delivery-service|Dockerfile|delivery-service"
  "../../backend/services/marketing-service|Dockerfile|marketing-service"
  "../../backend/services/platform/region-service|Dockerfile|region-service"
)

# Build all services
for service in "${SERVICES[@]}"; do
  # Strip carriage returns if file is edited on Windows (CRLF to LF issue)
  service=$(echo "$service" | tr -d '\r')
  IFS="|" read -r CONTEXT DOCKERFILE SUFFIX <<< "$service"
  IMAGE_NAME="${DOCKER_HUB_USER}/vetreport-${SUFFIX}:latest"
  
  echo "----------------------------------------------------------------------"
  echo "Building: ${IMAGE_NAME}"
  echo "Context: ${CONTEXT}"
  echo "Dockerfile: ${DOCKERFILE}"
  echo "----------------------------------------------------------------------"
  
  docker build -t "${IMAGE_NAME}" -f "${CONTEXT}/${DOCKERFILE}" "${CONTEXT}"
done

echo "======================================================================"
echo "All images built successfully! Starting push to Docker Hub..."
echo "======================================================================"

# Push all services
for service in "${SERVICES[@]}"; do
  # Strip carriage returns if file is edited on Windows (CRLF to LF issue)
  service=$(echo "$service" | tr -d '\r')
  IFS="|" read -r CONTEXT DOCKERFILE SUFFIX <<< "$service"
  IMAGE_NAME="${DOCKER_HUB_USER}/vetreport-${SUFFIX}:latest"
  
  echo "Pushing: ${IMAGE_NAME}..."
  docker push "${IMAGE_NAME}"
done

echo "======================================================================"
echo "SUCCESS: All images built and pushed successfully!"
echo "======================================================================"
echo "Next steps on your production server:"
echo "1. Copy docker-compose.prod.yml to the instance."
echo "2. Set your environment variables (.env file)."
echo "3. Run: docker compose -f docker-compose.prod.yml up -d"
echo "======================================================================"
