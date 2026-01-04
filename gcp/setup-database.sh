#!/bin/bash

# Setup Cloud SQL Database for Solana GitHub Collector
# This script creates a new PostgreSQL database on GCP Cloud SQL

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== GCP Cloud SQL Database Setup ===${NC}\n"

# Configuration
PROJECT_ID="${GCP_PROJECT_ID}"
REGION="${GCP_REGION:-us-central1}"
DB_INSTANCE_NAME="${GCP_DB_INSTANCE_NAME:-solana-github-collector-db}"
DB_VERSION="POSTGRES_15"
DB_TIER="${GCP_DB_TIER:-db-f1-micro}"  # db-f1-micro, db-g1-small, db-n1-standard-1, etc.
DB_NAME="${DB_NAME:-solana_analytics}"
DB_USERNAME="${DB_USERNAME:-postgres}"
DB_PASSWORD="${DB_PASSWORD}"

# Validate required variables
if [ -z "$PROJECT_ID" ]; then
    echo -e "${RED}Error: GCP_PROJECT_ID is not set${NC}"
    echo "Set it with: export GCP_PROJECT_ID=your-project-id"
    exit 1
fi

if [ -z "$DB_PASSWORD" ]; then
    echo -e "${YELLOW}Warning: DB_PASSWORD not set. Generating random password...${NC}"
    DB_PASSWORD=$(openssl rand -base64 32)
    echo -e "${BLUE}Generated password: ${DB_PASSWORD}${NC}"
    echo -e "${YELLOW}Save this password! Add to .env: DB_PASSWORD=${DB_PASSWORD}${NC}\n"
fi

echo -e "${BLUE}Configuration:${NC}"
echo "  Project ID:       $PROJECT_ID"
echo "  Region:           $REGION"
echo "  Instance Name:    $DB_INSTANCE_NAME"
echo "  Database Version: $DB_VERSION"
echo "  Tier:             $DB_TIER"
echo "  Database Name:    $DB_NAME"
echo "  Username:         $DB_USERNAME"
echo ""

read -p "Continue with these settings? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Cancelled."
    exit 0
fi

# Set the project
echo -e "\n${GREEN}Step 1: Setting GCP project...${NC}"
gcloud config set project ${PROJECT_ID}

# Enable required APIs
echo -e "\n${GREEN}Step 2: Enabling Cloud SQL APIs...${NC}"
gcloud services enable sqladmin.googleapis.com sql-component.googleapis.com

# Check if instance already exists
echo -e "\n${GREEN}Step 3: Checking if database instance exists...${NC}"
if gcloud sql instances describe ${DB_INSTANCE_NAME} --project=${PROJECT_ID} 2>/dev/null; then
    echo -e "${YELLOW}Instance ${DB_INSTANCE_NAME} already exists.${NC}"
    read -p "Do you want to continue with the existing instance? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Cancelled."
        exit 0
    fi
else
    # Create Cloud SQL instance
    echo -e "\n${GREEN}Step 4: Creating Cloud SQL instance...${NC}"
    echo "This may take 5-10 minutes..."

    gcloud sql instances create ${DB_INSTANCE_NAME} \
        --database-version=${DB_VERSION} \
        --tier=${DB_TIER} \
        --region=${REGION} \
        --root-password=${DB_PASSWORD} \
        --backup-start-time=03:00 \
        --enable-bin-log \
        --retained-backups-count=7 \
        --retained-transaction-log-days=7 \
        --maintenance-window-day=SUN \
        --maintenance-window-hour=4 \
        --project=${PROJECT_ID}

    echo -e "${GREEN}Cloud SQL instance created successfully!${NC}"
fi

# Create the database
echo -e "\n${GREEN}Step 5: Creating database '${DB_NAME}'...${NC}"
gcloud sql databases create ${DB_NAME} \
    --instance=${DB_INSTANCE_NAME} \
    --project=${PROJECT_ID} 2>/dev/null || \
    echo -e "${YELLOW}Database ${DB_NAME} already exists${NC}"

# Set password for postgres user
echo -e "\n${GREEN}Step 6: Setting password for postgres user...${NC}"
gcloud sql users set-password ${DB_USERNAME} \
    --instance=${DB_INSTANCE_NAME} \
    --password=${DB_PASSWORD} \
    --project=${PROJECT_ID}

# Get connection information
echo -e "\n${GREEN}Step 7: Getting connection information...${NC}"
CONNECTION_NAME=$(gcloud sql instances describe ${DB_INSTANCE_NAME} \
    --project=${PROJECT_ID} \
    --format='value(connectionName)')

PUBLIC_IP=$(gcloud sql instances describe ${DB_INSTANCE_NAME} \
    --project=${PROJECT_ID} \
    --format='value(ipAddresses[0].ipAddress)')

echo -e "\n${GREEN}=== Database Setup Complete ===${NC}\n"

echo -e "${BLUE}Connection Information:${NC}"
echo "  Instance Name:    ${DB_INSTANCE_NAME}"
echo "  Connection Name:  ${CONNECTION_NAME}"
echo "  Public IP:        ${PUBLIC_IP}"
echo "  Database:         ${DB_NAME}"
echo "  Username:         ${DB_USERNAME}"
echo "  Password:         ${DB_PASSWORD}"
echo ""

# Save connection info to file
echo -e "${GREEN}Saving connection info to gcp/db-connection-info.txt...${NC}"
mkdir -p gcp
cat > gcp/db-connection-info.txt <<EOF
# Cloud SQL Connection Information
# Generated: $(date)

PROJECT_ID=${PROJECT_ID}
DB_INSTANCE_NAME=${DB_INSTANCE_NAME}
CONNECTION_NAME=${CONNECTION_NAME}
PUBLIC_IP=${PUBLIC_IP}
DB_NAME=${DB_NAME}
DB_USERNAME=${DB_USERNAME}
DB_PASSWORD=${DB_PASSWORD}

# For Cloud Run deployment, use Unix socket:
DB_HOST=/cloudsql/${CONNECTION_NAME}

# For external connection (like local testing), use Public IP:
# DB_HOST=${PUBLIC_IP}

# Connection string:
# postgresql://${DB_USERNAME}:${DB_PASSWORD}@${PUBLIC_IP}:5432/${DB_NAME}
EOF

echo -e "${GREEN}Connection info saved!${NC}\n"

# Instructions for next steps
echo -e "${YELLOW}=== Next Steps ===${NC}\n"

echo "1. Store credentials in Secret Manager:"
echo "   ./gcp/store-secrets.sh"
echo ""

echo "2. Initialize database schema:"
echo "   ./gcp/init-schema.sh"
echo ""

echo "3. Test connection locally:"
echo "   export DB_HOST=${PUBLIC_IP}"
echo "   export DB_USERNAME=${DB_USERNAME}"
echo "   export DB_PASSWORD=${DB_PASSWORD}"
echo "   export DB_NAME=${DB_NAME}"
echo "   node src/index.js"
echo ""

echo "4. To allow connections from your IP:"
echo "   gcloud sql instances patch ${DB_INSTANCE_NAME} \\"
echo "     --authorized-networks=\$(curl -s ifconfig.me) \\"
echo "     --project=${PROJECT_ID}"
echo ""

echo -e "${YELLOW}Important: Keep the password secure!${NC}"
echo -e "${YELLOW}The password is saved in gcp/db-connection-info.txt${NC}"
