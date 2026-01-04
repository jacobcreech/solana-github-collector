const express = require('express');
const cron = require('node-cron');
const config = require('./config');
const logger = require('./utils/logger');
const DatabaseService = require('./services/database/DatabaseService');
const GitHubService = require('./services/github/GitHubService');
const RepositoryDiscoveryWorker = require('./workers/RepositoryDiscoveryWorker');
const DeveloperActivityWorker = require('./workers/DeveloperActivityWorker');

class SolanaGithubCollector {
  constructor() {
    this.app = express();
    this.dbService = new DatabaseService();
    this.githubService = new GitHubService();
    this.repoWorker = new RepositoryDiscoveryWorker();
    this.devWorker = new DeveloperActivityWorker();
    this.isInitialized = false;
    this.cronJobs = [];
  }

  /**
   * Initialize the application
   */
  async initialize() {
    try {
      logger.info('Initializing Solana GitHub Collector');

      // Test database connection
      const dbConnected = await this.dbService.testConnection();
      if (!dbConnected) {
        throw new Error('Failed to connect to database');
      }

      // Sync database models (creates tables if they don't exist)
      await this.dbService.syncModels();

      // Setup HTTP server for health checks
      this.setupHTTPServer();

      // Setup cron jobs
      this.setupCronJobs();

      this.isInitialized = true;
      logger.info('Solana GitHub Collector initialized successfully');

      // Run initial discovery immediately
      if (process.env.RUN_ON_STARTUP !== 'false') {
        logger.info('Running initial repository discovery');
        await this.repoWorker.run();

        logger.info('Running initial developer activity collection');
        await this.devWorker.run();
      }

    } catch (error) {
      logger.error({
        error: error.message,
        stack: error.stack
      }, 'Failed to initialize application');
      throw error;
    }
  }

  /**
   * Setup HTTP server for health checks and monitoring
   */
  setupHTTPServer() {
    this.app.use(express.json());

    // Health check endpoint
    this.app.get('/health', async (req, res) => {
      try {
        const dbHealthy = await this.dbService.testConnection();
        const stats = await this.dbService.getStats();
        const githubHealth = await this.githubService.getHealthStatus();

        const health = {
          status: dbHealthy ? 'healthy' : 'unhealthy',
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          database: {
            connected: dbHealthy,
            stats
          },
          github: {
            tokens: githubHealth
          },
          workers: {
            repoDiscovery: {
              running: this.repoWorker.isRunning
            },
            developerActivity: {
              running: this.devWorker.isRunning
            }
          }
        };

        const statusCode = dbHealthy ? 200 : 503;
        res.status(statusCode).json(health);
      } catch (error) {
        logger.error({ error: error.message }, 'Health check failed');
        res.status(503).json({
          status: 'unhealthy',
          error: error.message
        });
      }
    });

    // Readiness check endpoint
    this.app.get('/ready', (req, res) => {
      if (this.isInitialized) {
        res.status(200).json({
          status: 'ready',
          timestamp: new Date().toISOString()
        });
      } else {
        res.status(503).json({
          status: 'not ready',
          timestamp: new Date().toISOString()
        });
      }
    });

    // Stats endpoint
    this.app.get('/stats', async (req, res) => {
      try {
        const stats = await this.dbService.getStats();
        res.json({
          timestamp: new Date().toISOString(),
          ...stats
        });
      } catch (error) {
        logger.error({ error: error.message }, 'Failed to get stats');
        res.status(500).json({ error: error.message });
      }
    });

    // Metrics endpoint (Prometheus format)
    this.app.get('/metrics', async (req, res) => {
      try {
        const stats = await this.dbService.getStats();
        const githubHealth = await this.githubService.getHealthStatus();

        let metrics = '';
        metrics += `# HELP solana_github_repositories Total number of repositories\n`;
        metrics += `# TYPE solana_github_repositories gauge\n`;
        metrics += `solana_github_repositories ${stats.repositories}\n\n`;

        metrics += `# HELP solana_github_developers Total number of developers\n`;
        metrics += `# TYPE solana_github_developers gauge\n`;
        metrics += `solana_github_developers ${stats.developers}\n\n`;

        metrics += `# HELP solana_github_activities Total number of activities\n`;
        metrics += `# TYPE solana_github_activities gauge\n`;
        metrics += `solana_github_activities ${stats.activities}\n\n`;

        // GitHub token metrics
        githubHealth.forEach((token) => {
          metrics += `# HELP github_token_rate_limit_remaining Remaining rate limit for token\n`;
          metrics += `# TYPE github_token_rate_limit_remaining gauge\n`;
          metrics += `github_token_rate_limit_remaining{token_id="${token.tokenId}",type="core"} ${token.rateLimits.core.remaining}\n`;
          metrics += `github_token_rate_limit_remaining{token_id="${token.tokenId}",type="search"} ${token.rateLimits.search.remaining}\n`;
          metrics += `github_token_rate_limit_remaining{token_id="${token.tokenId}",type="code_search"} ${token.rateLimits.codeSearch.remaining}\n\n`;
        });

        res.set('Content-Type', 'text/plain');
        res.send(metrics);
      } catch (error) {
        logger.error({ error: error.message }, 'Failed to generate metrics');
        res.status(500).send('Error generating metrics');
      }
    });

    // Manual trigger endpoints (for debugging/ops)
    this.app.post('/trigger/discovery', async (req, res) => {
      if (this.repoWorker.isRunning) {
        return res.status(409).json({ error: 'Discovery already running' });
      }

      logger.info('Manual trigger: Repository discovery');
      this.repoWorker.run().catch(err => {
        logger.error({ error: err.message }, 'Manual discovery failed');
      });

      res.json({ message: 'Repository discovery started' });
    });

    this.app.post('/trigger/activities', async (req, res) => {
      if (this.devWorker.isRunning) {
        return res.status(409).json({ error: 'Activity collection already running' });
      }

      logger.info('Manual trigger: Developer activity collection');
      this.devWorker.run().catch(err => {
        logger.error({ error: err.message }, 'Manual activity collection failed');
      });

      res.json({ message: 'Developer activity collection started' });
    });

    this.app.post('/trigger/backfill', async (req, res) => {
      if (this.devWorker.isRunning) {
        return res.status(409).json({ error: 'Activity collection already running' });
      }

      logger.info('Manual trigger: Activity backfill');
      this.devWorker.runBackfill().catch(err => {
        logger.error({ error: err.message }, 'Manual backfill failed');
      });

      res.json({ message: 'Activity backfill started' });
    });

    // Start the server
    const port = config.port;
    this.app.listen(port, () => {
      logger.info({ port }, 'HTTP server started');
    });
  }

  /**
   * Setup cron jobs for periodic data collection
   */
  setupCronJobs() {
    // Repository discovery - runs every hour
    if (config.workers.repoDiscovery.enabled) {
      const discoveryJob = cron.schedule('0 * * * *', async () => {
        logger.info('Cron: Starting repository discovery');
        try {
          await this.repoWorker.run();
        } catch (error) {
          logger.error({ error: error.message }, 'Cron: Repository discovery failed');
        }
      });

      this.cronJobs.push(discoveryJob);
      logger.info('Repository discovery cron scheduled (every hour)');
    }

    // Developer activity collection - runs every 2 hours
    if (config.workers.developerFetch.enabled) {
      const activityJob = cron.schedule('0 */2 * * *', async () => {
        logger.info('Cron: Starting developer activity collection');
        try {
          await this.devWorker.run();
        } catch (error) {
          logger.error({ error: error.message }, 'Cron: Developer activity collection failed');
        }
      });

      this.cronJobs.push(activityJob);
      logger.info('Developer activity collection cron scheduled (every 2 hours)');
    }

    // Backfill missing activities - runs daily at 2 AM
    if (config.workers.developerFetch.enabled) {
      const backfillJob = cron.schedule('0 2 * * *', async () => {
        logger.info('Cron: Starting activity backfill');
        try {
          await this.devWorker.runBackfill();
        } catch (error) {
          logger.error({ error: error.message }, 'Cron: Activity backfill failed');
        }
      });

      this.cronJobs.push(backfillJob);
      logger.info('Activity backfill cron scheduled (daily at 2 AM)');
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    logger.info('Shutting down gracefully');

    // Stop cron jobs
    this.cronJobs.forEach(job => job.stop());

    // Close database connection
    await this.dbService.close();

    logger.info('Shutdown complete');
    process.exit(0);
  }
}

// Create and start the application
const app = new SolanaGithubCollector();

// Handle graceful shutdown
process.on('SIGTERM', () => app.shutdown());
process.on('SIGINT', () => app.shutdown());

// Start the application
app.initialize().catch((error) => {
  logger.error({ error: error.message }, 'Failed to start application');
  process.exit(1);
});
