# Solana GitHub Collector

An efficient microservice for collecting GitHub repository, developer, and commit data for the Solana ecosystem. Designed for continuous operation on GCP with intelligent multi-token rotation and parallel processing.

## Features

- **Multi-Token Rotation**: Efficiently rotates between multiple GitHub tokens to maximize API rate limits
- **Multiple Search Strategies**:
  - Code search for targeted discovery
  - Repository search for broader coverage
  - Trending repository tracking
- **Parallel Processing**: Concurrent workers for repository discovery and developer data collection
- **Smart Rate Limiting**: Automatic handling of GitHub API rate limits with token health monitoring
- **Database Integration**: PostgreSQL with Sequelize ORM matching existing analytics schema
- **Health Monitoring**: Built-in health checks, metrics endpoints (Prometheus-compatible), and logging
- **GCP Ready**: Optimized for Google Cloud Platform deployment with Cloud Run

## Architecture

```
solana-github-collector/
├── src/
│   ├── config/           # Configuration management
│   ├── models/           # Database models (Sequelize)
│   ├── services/
│   │   ├── github/       # GitHub API client with token rotation
│   │   └── database/     # Database service layer
│   ├── workers/          # Background workers
│   │   ├── RepositoryDiscoveryWorker.js
│   │   └── DeveloperActivityWorker.js
│   ├── utils/            # Utilities (logger, etc.)
│   └── index.js          # Main application
├── Dockerfile            # Docker configuration
├── docker-compose.dev.yml # Local development setup
└── README.md
```

## Prerequisites

- Node.js 20.x
- Docker and Docker Compose
- PostgreSQL 15+ (or use the included Docker setup)
- Multiple GitHub Personal Access Tokens (for optimal performance)

## Getting Started

### 1. Clone and Setup

```bash
cd /home/jacob_creech/solana-github-collector

# Copy environment template
cp .env.example .env

# Edit .env with your configuration
nano .env
```

### 2. Configure GitHub Tokens

Create GitHub Personal Access Tokens at: https://github.com/settings/tokens

Required scopes:
- `public_repo` - Access public repositories
- `read:user` - Read user profile data

Add tokens to `.env`:
```env
GITHUB_TOKEN_1=ghp_your_token_1
GITHUB_TOKEN_2=ghp_your_token_2
GITHUB_TOKEN_3=ghp_your_token_3
# Add up to 5 tokens for optimal performance
```

### 3. Start with Docker Compose

```bash
# Start database and application
docker-compose -f docker-compose.dev.yml up -d

# Check logs
docker-compose -f docker-compose.dev.yml logs -f app

# Check health
curl http://localhost:3000/health
```

### 4. Optional: Start with pgAdmin

```bash
# Start with database management tool
docker-compose -f docker-compose.dev.yml --profile tools up -d

# Access pgAdmin at http://localhost:5050
# Email: admin@admin.com
# Password: admin
```

## Usage

### Health Check Endpoints

```bash
# Application health
curl http://localhost:3000/health

# Readiness check
curl http://localhost:3000/ready

# Statistics
curl http://localhost:3000/stats

# Prometheus metrics
curl http://localhost:3000/metrics
```

### Manual Triggers (for testing)

```bash
# Trigger repository discovery
curl -X POST http://localhost:3000/trigger/discovery

# Trigger developer activity collection
curl -X POST http://localhost:3000/trigger/activities

# Trigger activity backfill
curl -X POST http://localhost:3000/trigger/backfill
```

### Scheduled Jobs

The microservice runs these jobs automatically:

- **Repository Discovery**: Every hour
- **Developer Activity Collection**: Every 2 hours
- **Activity Backfill**: Daily at 2 AM

## Database Schema

### Tables

**SolanaGithubRepos**
- Repository information (ID, name, owner, stars, etc.)

**Developers**
- Developer profiles (username, name, avatar, location, etc.)

**Activities**
- Developer activity data (commits, additions, deletions by week)

**RepoTypes**
- Repository type classification (anchor, web3.js, native, etc.)

## Configuration

Key environment variables:

```env
# Database
DB_HOST=postgres
DB_USERNAME=postgres
DB_PASSWORD=your_password
DB_NAME=solana_analytics

# GitHub Tokens (add as many as you have)
GITHUB_TOKEN_1=token1
GITHUB_TOKEN_2=token2
# ... up to GITHUB_TOKEN_5

# Workers
RUN_ON_STARTUP=true  # Run discovery on startup

# Logging
LOG_LEVEL=info  # debug, info, warn, error
```

## Development

### Run Locally Without Docker

```bash
# Install dependencies
npm install

# Start PostgreSQL (or use Docker)
docker-compose -f docker-compose.dev.yml up -d postgres

# Update .env with DB_HOST=localhost

# Run the application
npm start

# Or with auto-reload
npm run dev
```

### Testing

```bash
# Run tests (when implemented)
npm test
```

## Deployment to GCP

### Prerequisites

1. Google Cloud SDK installed and configured
2. GCP project created
3. Database (Cloud SQL or external PostgreSQL)

### Setup

```bash
# Set your GCP project
export GCP_PROJECT_ID=your-project-id

# Run setup script (creates secrets, enables APIs)
./gcp-setup.sh

# Deploy to Cloud Run
./gcp-deploy.sh
```

### Manual Deployment

```bash
# Build and push Docker image
docker build -t gcr.io/your-project/solana-github-collector .
docker push gcr.io/your-project/solana-github-collector

# Deploy to Cloud Run
gcloud run deploy solana-github-collector \
  --image gcr.io/your-project/solana-github-collector \
  --platform managed \
  --region us-central1 \
  --memory 2Gi \
  --cpu 2 \
  --timeout 3600 \
  --min-instances 1
```

## Performance

### Rate Limits (per token per hour)

- Core API: 5,000 requests
- Search API: 30 requests/min
- Code Search API: 10 requests/min

### Recommended Configuration

- **3-5 GitHub tokens**: Optimal for continuous operation
- **2 GB RAM**: Sufficient for typical workloads
- **2 CPUs**: Good balance for parallel processing

### Expected Throughput

With 5 tokens:
- ~25,000 core API calls/hour
- ~150 search calls/hour
- ~50 code search calls/hour

## Monitoring

### Metrics

The service exposes Prometheus-compatible metrics at `/metrics`:

- `solana_github_repositories` - Total repositories
- `solana_github_developers` - Total developers
- `solana_github_activities` - Total activities
- `github_token_rate_limit_remaining` - Per-token rate limits

### Logging

Structured JSON logging with configurable levels:

```bash
# View logs (Docker)
docker-compose -f docker-compose.dev.yml logs -f app

# View logs (GCP)
gcloud logs tail --service solana-github-collector
```

## Troubleshooting

### Common Issues

**"No GitHub tokens configured"**
- Ensure `GITHUB_TOKEN_1` (at least) is set in `.env`

**"Failed to connect to database"**
- Check database is running: `docker-compose -f docker-compose.dev.yml ps`
- Verify credentials in `.env`

**Rate limiting issues**
- Add more GitHub tokens
- Check token health: `curl http://localhost:3000/health`

**Container fails to start**
- Check logs: `docker-compose -f docker-compose.dev.yml logs app`
- Verify all environment variables are set

## Differences from Original Analytics Service

### Improvements

1. **Better Token Management**
   - Proactive rate limit checking
   - Token health monitoring
   - Automatic rotation with smart selection

2. **Multiple Search Strategies**
   - Code search (original method)
   - Repository search (broader coverage)
   - Trending repositories

3. **Optimized Architecture**
   - Separate workers for different tasks
   - Parallel processing capabilities
   - Better error handling and retry logic

4. **Enhanced Monitoring**
   - Health check endpoints
   - Prometheus metrics
   - Structured logging

5. **Production Ready**
   - Docker containerization
   - GCP deployment scripts
   - Graceful shutdown handling

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

ISC

## Support

For issues, questions, or contributions, please open an issue on the repository.
