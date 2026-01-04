#!/bin/bash

# GCP Deployment Script for Solana GitHub Collector
# This script helps deploy the microservice to Google Cloud Platform

set -e

# Configuration
PROJECT_ID="${GCP_PROJECT_ID}"
REGION="${GCP_REGION:-us-central1}"
SERVICE_NAME="solana-github-collector"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Solana GitHub Collector - GCP Deployment ===${NC}\n"

# Check if PROJECT_ID is set
if [ -z "$PROJECT_ID" ]; then
    echo -e "${RED}Error: GCP_PROJECT_ID environment variable is not set${NC}"
    echo "Please set it using: export GCP_PROJECT_ID=your-project-id"
    exit 1
fi

echo -e "${YELLOW}Project ID:${NC} $PROJECT_ID"
echo -e "${YELLOW}Region:${NC} $REGION"
echo -e "${YELLOW}Service Name:${NC} $SERVICE_NAME"
echo ""

# Step 1: Build the Docker image
echo -e "${GREEN}Step 1: Building Docker image...${NC}"
docker build -t ${IMAGE_NAME}:latest .

# Step 2: Push to Google Container Registry
echo -e "${GREEN}Step 2: Pushing to Google Container Registry...${NC}"
docker push ${IMAGE_NAME}:latest

# Step 3: Deploy to Cloud Run
echo -e "${GREEN}Step 3: Deploying to Cloud Run...${NC}"
gcloud run deploy ${SERVICE_NAME} \
    --image ${IMAGE_NAME}:latest \
    --platform managed \
    --region ${REGION} \
    --allow-unauthenticated \
    --memory 2Gi \
    --cpu 2 \
    --timeout 3600 \
    --max-instances 1 \
    --min-instances 1 \
    --set-env-vars NODE_ENV=production,ECOSYSTEM=solana,LOG_LEVEL=info \
    --set-secrets DB_HOST=DB_HOST:latest,DB_USERNAME=DB_USERNAME:latest,DB_PASSWORD=DB_PASSWORD:latest,DB_NAME=DB_NAME:latest,GITHUB_TOKEN_1=GITHUB_TOKEN_1:latest,GITHUB_TOKEN_2=GITHUB_TOKEN_2:latest,GITHUB_TOKEN_3=GITHUB_TOKEN_3:latest,GITHUB_TOKEN_4=GITHUB_TOKEN_4:latest,GITHUB_TOKEN_5=GITHUB_TOKEN_5:latest

echo ""
echo -e "${GREEN}=== Deployment Complete ===${NC}"
echo ""
echo "Service URL:"
gcloud run services describe ${SERVICE_NAME} --region ${REGION} --format='value(status.url)'
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Check service health: curl \$(gcloud run services describe ${SERVICE_NAME} --region ${REGION} --format='value(status.url)')/health"
echo "2. View logs: gcloud logs tail --service ${SERVICE_NAME}"
echo "3. Monitor metrics in GCP Console"
