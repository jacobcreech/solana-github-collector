#!/bin/bash

# Store Database Credentials and GitHub Tokens in Secret Manager

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${GREEN}=== Store Secrets in GCP Secret Manager ===${NC}\n"

PROJECT_ID="${GCP_PROJECT_ID}"

if [ -z "$PROJECT_ID" ]; then
    echo -e "${RED}Error: GCP_PROJECT_ID is not set${NC}"
    exit 1
fi

# Check if db-connection-info.txt exists
if [ -f "gcp/db-connection-info.txt" ]; then
    echo -e "${BLUE}Loading database connection info...${NC}"
    source gcp/db-connection-info.txt
else
    echo -e "${YELLOW}No db-connection-info.txt found. Please enter values manually.${NC}"
fi

# Enable Secret Manager API
echo -e "\n${GREEN}Step 1: Enabling Secret Manager API...${NC}"
gcloud services enable secretmanager.googleapis.com --project=${PROJECT_ID}

# Function to create or update secret
create_or_update_secret() {
    local secret_name=$1
    local secret_value=$2

    if [ -z "$secret_value" ]; then
        echo -e "${YELLOW}Skipping ${secret_name} - no value provided${NC}"
        return
    fi

    # Check if secret exists
    if gcloud secrets describe ${secret_name} --project=${PROJECT_ID} 2>/dev/null; then
        echo -e "${BLUE}Updating ${secret_name}...${NC}"
        echo -n "${secret_value}" | gcloud secrets versions add ${secret_name} \
            --data-file=- \
            --project=${PROJECT_ID}
    else
        echo -e "${BLUE}Creating ${secret_name}...${NC}"
        echo -n "${secret_value}" | gcloud secrets create ${secret_name} \
            --data-file=- \
            --replication-policy="automatic" \
            --project=${PROJECT_ID}
    fi
}

# Store database secrets
echo -e "\n${GREEN}Step 2: Storing database credentials...${NC}"

if [ -z "$DB_HOST" ]; then
    read -p "Enter DB_HOST (leave empty for Cloud SQL socket): " DB_HOST
fi
if [ -z "$DB_USERNAME" ]; then
    read -p "Enter DB_USERNAME: " DB_USERNAME
fi
if [ -z "$DB_PASSWORD" ]; then
    read -sp "Enter DB_PASSWORD: " DB_PASSWORD
    echo
fi
if [ -z "$DB_NAME" ]; then
    read -p "Enter DB_NAME: " DB_NAME
fi

# For Cloud Run, use Unix socket path
if [ -n "$CONNECTION_NAME" ]; then
    DB_HOST="/cloudsql/${CONNECTION_NAME}"
fi

create_or_update_secret "DB_HOST" "${DB_HOST}"
create_or_update_secret "DB_USERNAME" "${DB_USERNAME}"
create_or_update_secret "DB_PASSWORD" "${DB_PASSWORD}"
create_or_update_secret "DB_NAME" "${DB_NAME}"

# Store GitHub tokens
echo -e "\n${GREEN}Step 3: Storing GitHub tokens...${NC}"
echo "Enter your GitHub Personal Access Tokens (press Enter to skip)"

for i in {1..10}; do
    if [ -n "${!GITHUB_TOKEN_VAR}" ]; then
        # Use env var if set
        GITHUB_TOKEN_VAR="GITHUB_TOKEN_${i}"
        TOKEN_VALUE="${!GITHUB_TOKEN_VAR}"
    else
        # Prompt for token
        read -sp "Enter GITHUB_TOKEN_${i} (or press Enter to skip): " TOKEN_VALUE
        echo
    fi

    if [ -n "$TOKEN_VALUE" ]; then
        create_or_update_secret "GITHUB_TOKEN_${i}" "${TOKEN_VALUE}"
    else
        if [ $i -eq 1 ]; then
            echo -e "${RED}Warning: You must provide at least one GitHub token${NC}"
            read -sp "Enter GITHUB_TOKEN_1: " TOKEN_VALUE
            echo
            create_or_update_secret "GITHUB_TOKEN_1" "${TOKEN_VALUE}"
        else
            echo -e "${YELLOW}Skipping remaining tokens${NC}"
            break
        fi
    fi
done

# Grant access to Cloud Run service account
echo -e "\n${GREEN}Step 4: Granting Secret Manager access to Cloud Run...${NC}"
PROJECT_NUMBER=$(gcloud projects describe ${PROJECT_ID} --format='value(projectNumber)')
COMPUTE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

echo "Granting access to service account: ${COMPUTE_SA}"

# Get all secrets and grant access
for secret in $(gcloud secrets list --project=${PROJECT_ID} --format='value(name)'); do
    gcloud secrets add-iam-policy-binding ${secret} \
        --member="serviceAccount:${COMPUTE_SA}" \
        --role="roles/secretmanager.secretAccessor" \
        --project=${PROJECT_ID} 2>/dev/null || true
done

echo -e "\n${GREEN}=== Secrets Stored Successfully ===${NC}\n"

echo -e "${BLUE}Stored Secrets:${NC}"
gcloud secrets list --project=${PROJECT_ID}

echo -e "\n${YELLOW}Next Steps:${NC}"
echo "1. Initialize database schema: ./gcp/init-schema.sh"
echo "2. Create Cloud Run service: ./gcp/create-cloud-run.sh"
