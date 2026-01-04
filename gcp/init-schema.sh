#!/bin/bash

# Initialize Database Schema
# This script connects to Cloud SQL and initializes the database schema

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${GREEN}=== Initialize Database Schema ===${NC}\n"

PROJECT_ID="${GCP_PROJECT_ID}"

if [ -z "$PROJECT_ID" ]; then
    echo -e "${RED}Error: GCP_PROJECT_ID is not set${NC}"
    exit 1
fi

# Load connection info
if [ -f "gcp/db-connection-info.txt" ]; then
    source gcp/db-connection-info.txt
else
    echo -e "${RED}Error: gcp/db-connection-info.txt not found${NC}"
    echo "Run ./gcp/setup-database.sh first"
    exit 1
fi

echo -e "${BLUE}Configuration:${NC}"
echo "  Project:   $PROJECT_ID"
echo "  Instance:  $DB_INSTANCE_NAME"
echo "  Database:  $DB_NAME"
echo "  Public IP: $PUBLIC_IP"
echo ""

# Check if Cloud SQL Proxy is available
if ! command -v cloud-sql-proxy &> /dev/null; then
    echo -e "${YELLOW}Cloud SQL Proxy not found. You have two options:${NC}\n"

    echo "Option 1: Connect via authorized network (requires whitelisting your IP)"
    echo "Option 2: Install Cloud SQL Proxy"
    echo ""
    read -p "Which option? (1/2): " -n 1 -r
    echo

    if [[ $REPLY == "1" ]]; then
        # Authorize current IP
        CURRENT_IP=$(curl -s ifconfig.me)
        echo -e "\n${BLUE}Authorizing IP: ${CURRENT_IP}${NC}"

        gcloud sql instances patch ${DB_INSTANCE_NAME} \
            --authorized-networks=${CURRENT_IP} \
            --project=${PROJECT_ID}

        echo -e "${GREEN}IP authorized. Waiting for changes to apply...${NC}"
        sleep 10

        USE_PROXY=false
        DB_HOST=${PUBLIC_IP}
    else
        echo -e "\n${BLUE}Installing Cloud SQL Proxy...${NC}"
        curl -o cloud-sql-proxy https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.8.0/cloud-sql-proxy.linux.amd64
        chmod +x cloud-sql-proxy

        echo -e "${BLUE}Starting Cloud SQL Proxy...${NC}"
        ./cloud-sql-proxy ${CONNECTION_NAME} &
        PROXY_PID=$!
        sleep 5

        USE_PROXY=true
        DB_HOST="localhost"
    fi
else
    echo -e "${BLUE}Starting Cloud SQL Proxy...${NC}"
    cloud-sql-proxy ${CONNECTION_NAME} &
    PROXY_PID=$!
    sleep 5

    USE_PROXY=true
    DB_HOST="localhost"
fi

# Set environment variables
export DB_HOST=${DB_HOST}
export DB_PORT=5432
export DB_USERNAME=${DB_USERNAME}
export DB_PASSWORD=${DB_PASSWORD}
export DB_NAME=${DB_NAME}
export NODE_ENV=production

echo -e "\n${GREEN}Step 1: Testing database connection...${NC}"

# Test connection with psql if available
if command -v psql &> /dev/null; then
    echo "Testing connection..."
    PGPASSWORD=${DB_PASSWORD} psql -h ${DB_HOST} -U ${DB_USERNAME} -d ${DB_NAME} -c "SELECT version();" || {
        echo -e "${RED}Connection test failed${NC}"
        [ -n "$PROXY_PID" ] && kill $PROXY_PID 2>/dev/null
        exit 1
    }
else
    echo -e "${YELLOW}psql not available, skipping connection test${NC}"
fi

echo -e "\n${GREEN}Step 2: Running schema initialization...${NC}"

# Create a temporary script to initialize schema
cat > /tmp/init-schema.js <<'EOF'
const db = require('./src/models');

async function initSchema() {
  try {
    console.log('Connecting to database...');
    await db.sequelize.authenticate();
    console.log('Connection successful!');

    console.log('\nSyncing database models...');
    await db.sequelize.sync({ alter: false });

    console.log('\nDatabase schema initialized successfully!');
    console.log('\nTables created:');
    console.log('  - SolanaGithubRepos');
    console.log('  - Developers');
    console.log('  - Activities');
    console.log('  - RepoTypes');

    // Test queries
    const stats = await Promise.all([
      db.SolanaGithubRepos.count(),
      db.Developers.count(),
      db.Activities.count(),
      db.RepoTypes.count()
    ]);

    console.log('\nCurrent counts:');
    console.log(`  - Repositories: ${stats[0]}`);
    console.log(`  - Developers: ${stats[1]}`);
    console.log(`  - Activities: ${stats[2]}`);
    console.log(`  - Repo Types: ${stats[3]}`);

    await db.sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

initSchema();
EOF

# Run the initialization
cd /home/jacob_creech/solana-github-collector
node /tmp/init-schema.js

RESULT=$?

# Cleanup
rm /tmp/init-schema.js
[ -n "$PROXY_PID" ] && kill $PROXY_PID 2>/dev/null

if [ $RESULT -eq 0 ]; then
    echo -e "\n${GREEN}=== Schema Initialization Complete ===${NC}\n"
    echo -e "${BLUE}Your database is ready!${NC}"
    echo ""
    echo -e "${YELLOW}Next Steps:${NC}"
    echo "1. Create Cloud Run service: ./gcp/create-cloud-run.sh"
    echo "2. Deploy the application: ./gcp/deploy.sh"
else
    echo -e "\n${RED}Schema initialization failed${NC}"
    exit 1
fi
