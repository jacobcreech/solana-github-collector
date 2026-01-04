const GitHubService = require('../services/github/GitHubService');
const DatabaseService = require('../services/database/DatabaseService');
const config = require('../config');
const logger = require('../utils/logger');

class DeveloperActivityWorker {
  constructor() {
    this.githubService = new GitHubService();
    this.dbService = new DatabaseService();
    this.isRunning = false;
  }

  /**
   * Process a batch of repositories to collect developer activity
   */
  async processBatch(repos) {
    const currentTime = Math.floor(Date.now() / 1000);
    const week = 60 * 60 * 24 * 7;
    const referenceTime = currentTime - (week * 26); // Last 26 weeks (6 months)

    let processedCount = 0;
    let errorCount = 0;

    for (const repo of repos) {
      try {
        await this.processRepository(repo, referenceTime);
        processedCount++;

        logger.debug({
          repoId: repo.repoId,
          owner: repo.owner,
          name: repo.name
        }, 'Repository processed successfully');

      } catch (error) {
        errorCount++;
        logger.error({
          error: error.message,
          repoId: repo.repoId,
          owner: repo.owner,
          name: repo.name
        }, 'Failed to process repository');

        // Mark as closed source if 404
        if (error.status === 404) {
          await this.dbService.markRepositoryClosedSource(repo.repoId);
        }
      }
    }

    logger.info({
      processed: processedCount,
      errors: errorCount,
      total: repos.length
    }, 'Batch processing completed');

    return { processedCount, errorCount };
  }

  /**
   * Process a single repository to collect developer activity
   */
  async processRepository(repo, referenceTime) {
    const { repoId, owner, name, id: repositoryId } = repo;

    try {
      // Get contributor activity data
      const contributorsData = await this.githubService.getContributorsActivity({
        owner,
        repo: name
      });

      if (!contributorsData || contributorsData.length === 0) {
        logger.debug({
          owner,
          repo: name
        }, 'No contributor data found');
        return;
      }

      logger.debug({
        owner,
        repo: name,
        contributors: contributorsData.length
      }, 'Processing contributors');

      // Process each contributor
      for (const contribution of contributorsData) {
        try {
          await this.processContributor(
            contribution,
            repositoryId,
            referenceTime
          );
        } catch (error) {
          logger.error({
            error: error.message,
            username: contribution.author?.login,
            repo: `${owner}/${name}`
          }, 'Failed to process contributor');
        }
      }

    } catch (error) {
      // Re-throw to be handled by the batch processor
      throw error;
    }
  }

  /**
   * Process a single contributor and their activities
   */
  async processContributor(contribution, repositoryId, referenceTime) {
    if (!contribution.author || !contribution.author.login) {
      logger.debug('Skipping contributor with no author info');
      return;
    }

    const username = contribution.author.login;

    // Filter activities within the reference time
    const activities = contribution.weeks.filter(
      (item) => item.c !== 0 && item.w > referenceTime
    );

    if (activities.length === 0) {
      logger.debug({
        username
      }, 'No recent activities for contributor');
      return;
    }

    // Get or create developer
    let developer = await this.dbService.getDeveloper(username);

    if (!developer) {
      try {
        const userInfo = await this.githubService.getUser({ username });

        if (!userInfo) {
          logger.warn({ username }, 'User not found');
          return;
        }

        developer = await this.dbService.upsertDeveloper({
          username,
          name: userInfo.name,
          gitUrl: userInfo.html_url,
          avatar: userInfo.avatar_url,
          location: userInfo.location,
          twitter: userInfo.twitter_username
        });

        logger.debug({
          username,
          name: userInfo.name
        }, 'Developer created');

      } catch (error) {
        logger.error({
          error: error.message,
          username
        }, 'Failed to fetch or create developer');
        return;
      }
    }

    // Ensure developer exists (fetch again if needed)
    if (!developer) {
      developer = await this.dbService.getDeveloper(username);
      if (!developer) {
        logger.error({ username }, 'Developer still not found after creation attempt');
        return;
      }
    }

    // Create activity records
    const activitiesData = activities.map((activity) => ({
      commits: activity.c,
      additions: activity.a,
      deletions: activity.d,
      date: activity.w,
      developerId: developer.id,
      repositoryId
    }));

    if (activitiesData.length > 0) {
      try {
        await this.dbService.bulkCreateActivities(activitiesData);

        logger.debug({
          username,
          repositoryId,
          activities: activitiesData.length
        }, 'Activities saved');

      } catch (error) {
        logger.error({
          error: error.message,
          username,
          repositoryId,
          activities: activitiesData.length
        }, 'Failed to save activities');
      }
    }
  }

  /**
   * Run the worker to process repositories and collect developer activity
   */
  async run() {
    if (this.isRunning) {
      logger.warn('Developer activity worker already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting developer activity worker');

    try {
      const batchSize = config.workers.developerFetch.batchSize;
      const ecosystem = config.ecosystem;
      let offset = 0;
      let hasMore = true;
      let totalProcessed = 0;
      let totalErrors = 0;

      while (hasMore) {
        // Get batch of repositories
        const repos = await this.dbService.getRepositoriesForProcessing({
          ecosystem,
          limit: batchSize,
          offset,
          orderBy: 'createdAt'
        });

        if (repos.length === 0) {
          hasMore = false;
          logger.info('No more repositories to process');
          break;
        }

        logger.info({
          offset,
          batchSize: repos.length
        }, 'Processing batch of repositories');

        // Process the batch
        const { processedCount, errorCount } = await this.processBatch(repos);
        totalProcessed += processedCount;
        totalErrors += errorCount;

        offset += batchSize;

        // Add a small delay between batches to avoid overwhelming the system
        await this.sleep(5000);
      }

      logger.info({
        totalProcessed,
        totalErrors
      }, 'Developer activity worker completed');

    } catch (error) {
      logger.error({
        error: error.message
      }, 'Developer activity worker failed');
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Process repositories without activity data (backfill)
   */
  async runBackfill() {
    if (this.isRunning) {
      logger.warn('Developer activity worker already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting developer activity backfill');

    try {
      const batchSize = config.workers.developerFetch.batchSize;
      let totalProcessed = 0;
      let totalErrors = 0;
      let hasMore = true;

      while (hasMore) {
        // Get repositories without activity data
        const repos = await this.dbService.getRepositoriesWithoutActivities(batchSize);

        if (repos.length === 0) {
          hasMore = false;
          logger.info('No more repositories to backfill');
          break;
        }

        logger.info({
          batchSize: repos.length
        }, 'Backfilling batch of repositories');

        // Process the batch
        const { processedCount, errorCount } = await this.processBatch(repos);
        totalProcessed += processedCount;
        totalErrors += errorCount;

        // Add a delay between batches
        await this.sleep(5000);
      }

      logger.info({
        totalProcessed,
        totalErrors
      }, 'Developer activity backfill completed');

    } catch (error) {
      logger.error({
        error: error.message
      }, 'Developer activity backfill failed');
    } finally {
      this.isRunning = false;
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = DeveloperActivityWorker;
