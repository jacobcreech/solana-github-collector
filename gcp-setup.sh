#!/bin/bash

# GCP Setup Script for Solana GitHub Collector
# This script helps set up the required GCP resources

set -e

# Configuration
PROJECT_ID="${GCP_PROJECT_ID}"
REGION="${GCP_REGION:-us-central1}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}=== GCP Setup for Solana GitHub Collector ===${NC}\n"

# Check if PROJECT_ID is set
if [ -z "$PROJECT_ID" ]; then
    echo -e "${RED}Error: GCP_PROJECT_ID environment variable is not set${NC}"
    echo "Please set it using: export GCP_PROJECT_ID=your-project-id"
    exit 1
fi

echo -e "${YELLOW}Project ID:${NC} $PROJECT_ID"
echo -e "${YELLOW}Region:${NC} $REGION"
echo ""

# Step 1: Enable required APIs
echo -e "${GREEN}Step 1: Enabling required GCP APIs...${NC}"
gcloud services enable \
    run.googleapis.com \
    containerregistry.googleapis.com \
    cloudbuild.googleapis.com \
    secretmanager.googleapis.com \
    sql-component.googleapis.com \
    sqladmin.googleapis.com \
    --project=${PROJECT_ID}

echo -e "${GREEN}APIs enabled successfully${NC}\n"

# Step 2: Create secrets
echo -e "${GREEN}Step 2: Setting up Secret Manager...${NC}"
echo -e "${YELLOW}You'll need to create the following secrets in Secret Manager:${NC}"
echo "  - DB_HOST"
echo "  - DB_USERNAME"
echo "  - DB_PASSWORD"
echo "  - DB_NAME"
echo "  - GITHUB_TOKEN_1"
echo "  - GITHUB_TOKEN_2"
echo "  - GITHUB_TOKEN_3"
echo "  - GITHUB_TOKEN_4"
echo "  - GITHUB_TOKEN_5"
echo ""

read -p "Do you want to create these secrets now? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    # Database secrets
    read -p "Enter DB_HOST: " DB_HOST
    echo -n "$DB_HOST" | gcloud secrets create DB_HOST --data-file=- --project=${PROJECT_ID} 2>/dev/null || \
    echo -n "$DB_HOST" | gcloud secrets versions add DB_HOST --data-file=- --project=${PROJECT_ID}

    read -p "Enter DB_USERNAME: " DB_USERNAME
    echo -n "$DB_USERNAME" | gcloud secrets create DB_USERNAME --data-file=- --project=${PROJECT_ID} 2>/dev/null || \
    echo -n "$DB_USERNAME" | gcloud secrets versions add DB_USERNAME --data-file=- --project=${PROJECT_ID}

    read -sp "Enter DB_PASSWORD: " DB_PASSWORD
    echo
    echo -n "$DB_PASSWORD" | gcloud secrets create DB_PASSWORD --data-file=- --project=${PROJECT_ID} 2>/dev/null || \
    echo -n "$DB_PASSWORD" | gcloud secrets versions add DB_PASSWORD --data-file=- --project=${PROJECT_ID}

    read -p "Enter DB_NAME (default: solana_analytics): " DB_NAME
    DB_NAME=${DB_NAME:-solana_analytics}
    echo -n "$DB_NAME" | gcloud secrets create DB_NAME --data-file=- --project=${PROJECT_ID} 2>/dev/null || \
    echo -n "$DB_NAME" | gcloud secrets versions add DB_NAME --data-file=- --project=${PROJECT_ID}

    # GitHub tokens
    for i in {1..5}; do
        read -sp "Enter GITHUB_TOKEN_$i (or press enter to skip): " GITHUB_TOKEN
        echo
        if [ ! -z "$GITHUB_TOKEN" ]; then
            echo -n "$GITHUB_TOKEN" | gcloud secrets create GITHUB_TOKEN_$i --data-file=- --project=${PROJECT_ID} 2>/dev/null || \
            echo -n "$GITHUB_TOKEN" | gcloud secrets versions add GITHUB_TOKEN_$i --data-file=- --project=${PROJECT_ID}
        fi
    done

    echo -e "${GREEN}Secrets created successfully${NC}\n"
fi

# Step 3: Grant permissions
echo -e "${GREEN}Step 3: Setting up IAM permissions...${NC}"
PROJECT_NUMBER=$(gcloud projects describe ${PROJECT_ID} --format='value(projectNumber)')
COMPUTE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

gcloud projects add-iam-policy-binding ${PROJECT_ID} \
    --member="serviceAccount:${COMPUTE_SA}" \
    --role="roles/secretmanager.secretAccessor"

echo -e "${GREEN}IAM permissions configured${NC}\n"

# Step 4: Information about Cloud SQL
echo -e "${GREEN}Step 4: Database Setup${NC}"
echo -e "${YELLOW}You'll need a PostgreSQL database. Options:${NC}"
echo "  1. Use Cloud SQL (managed PostgreSQL on GCP)"
echo "  2. Use an external PostgreSQL database"
echo ""
echo -e "${YELLOW}To create a Cloud SQL instance:${NC}"
echo "  gcloud sql instances create solana-db \\"
echo "    --database-version=POSTGRES_15 \\"
echo "    --tier=db-f1-micro \\"
echo "    --region=${REGION} \\"
echo "    --project=${PROJECT_ID}"
echo ""

echo -e "${GREEN}=== Setup Complete ===${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Ensure your database is set up and accessible"
echo "2. Run ./gcp-deploy.sh to deploy the service"
echo "3. Monitor the service in GCP Console"
