#!/bin/bash

# Create Cloud Run Service (without deploying yet)
# This prepares the Cloud Run configuration

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${GREEN}=== Create Cloud Run Service Configuration ===${NC}\n"

# Configuration
PROJECT_ID="${GCP_PROJECT_ID}"
REGION="${GCP_REGION:-us-central1}"
SERVICE_NAME="${GCP_SERVICE_NAME:-solana-github-collector}"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

# Resource configuration
MEMORY="${GCP_MEMORY:-2Gi}"
CPU="${GCP_CPU:-2}"
TIMEOUT="${GCP_TIMEOUT:-3600}"
MAX_INSTANCES="${GCP_MAX_INSTANCES:-1}"
MIN_INSTANCES="${GCP_MIN_INSTANCES:-1}"

# Validate
if [ -z "$PROJECT_ID" ]; then
    echo -e "${RED}Error: GCP_PROJECT_ID is not set${NC}"
    exit 1
fi

# Load DB connection info
if [ -f "gcp/db-connection-info.txt" ]; then
    source gcp/db-connection-info.txt
else
    echo -e "${YELLOW}Warning: gcp/db-connection-info.txt not found${NC}"
    read -p "Enter DB_INSTANCE_NAME: " DB_INSTANCE_NAME
    read -p "Enter CONNECTION_NAME: " CONNECTION_NAME
fi

echo -e "${BLUE}Configuration:${NC}"
echo "  Project ID:      $PROJECT_ID"
echo "  Region:          $REGION"
echo "  Service Name:    $SERVICE_NAME"
echo "  Image:           $IMAGE_NAME"
echo "  Memory:          $MEMORY"
echo "  CPU:             $CPU"
echo "  Timeout:         ${TIMEOUT}s"
echo "  Min Instances:   $MIN_INSTANCES"
echo "  Max Instances:   $MAX_INSTANCES"
echo "  DB Instance:     $DB_INSTANCE_NAME"
echo "  Connection:      $CONNECTION_NAME"
echo ""

read -p "Continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Cancelled."
    exit 0
fi

# Set project
gcloud config set project ${PROJECT_ID}

# Enable required APIs
echo -e "\n${GREEN}Step 1: Enabling required APIs...${NC}"
gcloud services enable \
    run.googleapis.com \
    containerregistry.googleapis.com \
    cloudbuild.googleapis.com \
    artifactregistry.googleapis.com

# Build Docker image
echo -e "\n${GREEN}Step 2: Building Docker image...${NC}"
echo "This will build but not deploy the application"

# Build the image
docker build -t ${IMAGE_NAME}:latest \
    -f /home/jacob_creech/solana-github-collector/Dockerfile \
    /home/jacob_creech/solana-github-collector

echo -e "${GREEN}Image built successfully!${NC}"

# Push to Container Registry
echo -e "\n${GREEN}Step 3: Pushing image to Google Container Registry...${NC}"
docker push ${IMAGE_NAME}:latest

echo -e "${GREEN}Image pushed successfully!${NC}"

# Create service.yaml for Cloud Run
echo -e "\n${GREEN}Step 4: Creating Cloud Run service configuration...${NC}"

mkdir -p gcp

cat > gcp/service.yaml <<EOF
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: ${SERVICE_NAME}
  labels:
    cloud.googleapis.com/location: ${REGION}
spec:
  template:
    metadata:
      annotations:
        autoscaling.knative.dev/minScale: '${MIN_INSTANCES}'
        autoscaling.knative.dev/maxScale: '${MAX_INSTANCES}'
        run.googleapis.com/cloudsql-instances: ${CONNECTION_NAME}
        run.googleapis.com/cpu-throttling: 'false'
    spec:
      containerConcurrency: 1
      timeoutSeconds: ${TIMEOUT}
      serviceAccountName: ${PROJECT_NUMBER:-default}-compute@developer.gserviceaccount.com
      containers:
      - image: ${IMAGE_NAME}:latest
        resources:
          limits:
            memory: ${MEMORY}
            cpu: '${CPU}'
        env:
        - name: NODE_ENV
          value: production
        - name: PORT
          value: '3000'
        - name: ECOSYSTEM
          value: solana
        - name: LOG_LEVEL
          value: info
        - name: DB_PORT
          value: '5432'
        - name: DB_HOST
          valueFrom:
            secretKeyRef:
              name: DB_HOST
              key: latest
        - name: DB_USERNAME
          valueFrom:
            secretKeyRef:
              name: DB_USERNAME
              key: latest
        - name: DB_PASSWORD
          valueFrom:
            secretKeyRef:
              name: DB_PASSWORD
              key: latest
        - name: DB_NAME
          valueFrom:
            secretKeyRef:
              name: DB_NAME
              key: latest
        - name: GITHUB_TOKEN_1
          valueFrom:
            secretKeyRef:
              name: GITHUB_TOKEN_1
              key: latest
        - name: GITHUB_TOKEN_2
          valueFrom:
            secretKeyRef:
              name: GITHUB_TOKEN_2
              key: latest
        - name: GITHUB_TOKEN_3
          valueFrom:
            secretKeyRef:
              name: GITHUB_TOKEN_3
              key: latest
        - name: GITHUB_TOKEN_4
          valueFrom:
            secretKeyRef:
              name: GITHUB_TOKEN_4
              key: latest
        - name: GITHUB_TOKEN_5
          valueFrom:
            secretKeyRef:
              name: GITHUB_TOKEN_5
              key: latest
EOF

echo -e "${GREEN}Service configuration created: gcp/service.yaml${NC}"

# Create deployment script
cat > gcp/deploy.sh <<'DEPLOY_EOF'
#!/bin/bash

# Deploy to Cloud Run

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${GREEN}=== Deploying to Cloud Run ===${NC}\n"

# Load config
source gcp/db-connection-info.txt 2>/dev/null || true

PROJECT_ID="${GCP_PROJECT_ID}"
REGION="${GCP_REGION:-us-central1}"
SERVICE_NAME="${GCP_SERVICE_NAME:-solana-github-collector}"

if [ -z "$PROJECT_ID" ]; then
    echo "Error: GCP_PROJECT_ID is not set"
    exit 1
fi

echo -e "${BLUE}Deploying service: ${SERVICE_NAME}${NC}"
echo -e "${BLUE}Region: ${REGION}${NC}\n"

gcloud run services replace gcp/service.yaml \
    --region=${REGION} \
    --project=${PROJECT_ID}

echo -e "\n${GREEN}=== Deployment Complete ===${NC}\n"

# Get service URL
SERVICE_URL=$(gcloud run services describe ${SERVICE_NAME} \
    --region=${REGION} \
    --project=${PROJECT_ID} \
    --format='value(status.url)')

echo -e "${BLUE}Service URL: ${SERVICE_URL}${NC}\n"

echo "Check health:"
echo "  curl ${SERVICE_URL}/health"
echo ""
echo "View logs:"
echo "  gcloud logs tail --service ${SERVICE_NAME} --project=${PROJECT_ID}"
DEPLOY_EOF

chmod +x gcp/deploy.sh

echo -e "\n${GREEN}=== Setup Complete ===${NC}\n"

echo -e "${BLUE}Resources Created:${NC}"
echo "  ✓ Docker image built and pushed"
echo "  ✓ Cloud Run service configuration (gcp/service.yaml)"
echo "  ✓ Deployment script (gcp/deploy.sh)"
echo ""

echo -e "${YELLOW}Summary:${NC}"
echo "  Image:   ${IMAGE_NAME}:latest"
echo "  Service: ${SERVICE_NAME}"
echo "  Region:  ${REGION}"
echo ""

echo -e "${YELLOW}To deploy the service, run:${NC}"
echo "  ./gcp/deploy.sh"
echo ""

echo -e "${YELLOW}To update the image and redeploy:${NC}"
echo "  docker build -t ${IMAGE_NAME}:latest ."
echo "  docker push ${IMAGE_NAME}:latest"
echo "  ./gcp/deploy.sh"
echo ""

echo -e "${BLUE}Note: Service is configured but NOT deployed yet.${NC}"
echo -e "${BLUE}Run ./gcp/deploy.sh when ready to deploy.${NC}"
