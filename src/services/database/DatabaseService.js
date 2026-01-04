const db = require('../../models');
const logger = require('../../utils/logger');
const { Op } = require('sequelize');

class DatabaseService {
  constructor() {
    this.models = db;
  }

  /**
   * Test database connection
   */
  async testConnection() {
    try {
      await db.sequelize.authenticate();
      logger.info('Database connection established successfully');
      return true;
    } catch (error) {
      logger.error({ error: error.message }, 'Unable to connect to database');
      return false;
    }
  }

  /**
   * Sync database models (create tables if they don't exist)
   */
  async syncModels(options = {}) {
    try {
      await db.sequelize.sync(options);
      logger.info('Database models synced successfully');
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to sync database models');
      throw error;
    }
  }

  /**
   * Create or update a repository
   */
  async upsertRepository(repoData) {
    try {
      const [repo, created] = await db.SolanaGithubRepos.upsert({
        repoId: repoData.repoId,
        name: repoData.name,
        url: repoData.url,
        owner: repoData.owner,
        started: repoData.started,
        ecosystem: repoData.ecosystem || 'solana',
        isClosedSource: repoData.isClosedSource || false,
        issuesAndPrs: repoData.issuesAndPrs || 0,
        stars: repoData.stars || 0
      }, {
        returning: true
      });

      logger.debug({
        repoId: repoData.repoId,
        name: repoData.name,
        created
      }, 'Repository upserted');

      return repo;
    } catch (error) {
      logger.error({
        error: error.message,
        repoId: repoData.repoId
      }, 'Failed to upsert repository');
      throw error;
    }
  }

  /**
   * Bulk create repositories
   */
  async bulkCreateRepositories(reposData) {
    try {
      const result = await db.SolanaGithubRepos.bulkCreate(reposData, {
        ignoreDuplicates: true,
        returning: true
      });

      logger.info({
        count: result.length
      }, 'Repositories bulk created');

      return result;
    } catch (error) {
      logger.error({
        error: error.message,
        count: reposData.length
      }, 'Failed to bulk create repositories');
      throw error;
    }
  }

  /**
   * Get repository by repoId
   */
  async getRepository(repoId) {
    try {
      return await db.SolanaGithubRepos.findOne({
        where: { repoId }
      });
    } catch (error) {
      logger.error({
        error: error.message,
        repoId
      }, 'Failed to get repository');
      throw error;
    }
  }

  /**
   * Get repositories for processing (paginated)
   */
  async getRepositoriesForProcessing({ ecosystem, limit = 100, offset = 0, orderBy = 'createdAt' }) {
    try {
      return await db.SolanaGithubRepos.findAll({
        where: { ecosystem },
        order: [[orderBy, 'DESC']],
        limit,
        offset
      });
    } catch (error) {
      logger.error({
        error: error.message,
        ecosystem
      }, 'Failed to get repositories for processing');
      throw error;
    }
  }

  /**
   * Mark repository as closed source
   */
  async markRepositoryClosedSource(repoId) {
    try {
      await db.SolanaGithubRepos.update(
        { isClosedSource: true },
        { where: { repoId } }
      );

      logger.debug({ repoId }, 'Repository marked as closed source');
    } catch (error) {
      logger.error({
        error: error.message,
        repoId
      }, 'Failed to mark repository as closed source');
      throw error;
    }
  }

  /**
   * Create or update a developer
   */
  async upsertDeveloper(developerData) {
    try {
      const [developer, created] = await db.Developers.upsert({
        username: developerData.username,
        name: developerData.name,
        gitUrl: developerData.gitUrl,
        avatar: developerData.avatar,
        location: developerData.location,
        twitter: developerData.twitter
      }, {
        returning: true
      });

      logger.debug({
        username: developerData.username,
        created
      }, 'Developer upserted');

      return developer;
    } catch (error) {
      logger.error({
        error: error.message,
        username: developerData.username
      }, 'Failed to upsert developer');
      throw error;
    }
  }

  /**
   * Get developer by username
   */
  async getDeveloper(username) {
    try {
      return await db.Developers.findOne({
        where: { username }
      });
    } catch (error) {
      logger.error({
        error: error.message,
        username
      }, 'Failed to get developer');
      throw error;
    }
  }

  /**
   * Bulk create activities
   */
  async bulkCreateActivities(activitiesData) {
    try {
      const result = await db.Activities.bulkCreate(activitiesData, {
        ignoreDuplicates: true,
        returning: true
      });

      logger.debug({
        count: result.length
      }, 'Activities bulk created');

      return result;
    } catch (error) {
      logger.error({
        error: error.message,
        count: activitiesData.length
      }, 'Failed to bulk create activities');
      throw error;
    }
  }

  /**
   * Create or update repository type
   */
  async upsertRepoType(repoId, type) {
    try {
      const [repoType, created] = await db.RepoTypes.upsert({
        repoId,
        type
      }, {
        returning: true
      });

      logger.debug({
        repoId,
        type,
        created
      }, 'Repo type upserted');

      return repoType;
    } catch (error) {
      logger.error({
        error: error.message,
        repoId,
        type
      }, 'Failed to upsert repo type');
      throw error;
    }
  }

  /**
   * Bulk create repo types
   */
  async bulkCreateRepoTypes(repoTypesData) {
    try {
      const result = await db.RepoTypes.bulkCreate(repoTypesData, {
        ignoreDuplicates: true,
        returning: true
      });

      logger.debug({
        count: result.length
      }, 'Repo types bulk created');

      return result;
    } catch (error) {
      logger.error({
        error: error.message,
        count: repoTypesData.length
      }, 'Failed to bulk create repo types');
      throw error;
    }
  }

  /**
   * Get statistics
   */
  async getStats() {
    try {
      const [repoCount, developerCount, activityCount] = await Promise.all([
        db.SolanaGithubRepos.count(),
        db.Developers.count(),
        db.Activities.count()
      ]);

      return {
        repositories: repoCount,
        developers: developerCount,
        activities: activityCount
      };
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to get stats');
      throw error;
    }
  }

  /**
   * Check if repository exists
   */
  async repositoryExists(repoId) {
    try {
      const count = await db.SolanaGithubRepos.count({
        where: { repoId }
      });
      return count > 0;
    } catch (error) {
      logger.error({
        error: error.message,
        repoId
      }, 'Failed to check if repository exists');
      throw error;
    }
  }

  /**
   * Get repositories without activity data
   */
  async getRepositoriesWithoutActivities(limit = 100) {
    try {
      const repos = await db.sequelize.query(`
        SELECT r.*
        FROM "SolanaGithubRepos" r
        LEFT JOIN "Activities" a ON r.id = a."repositoryId"
        WHERE a.id IS NULL AND r."isClosedSource" = false
        ORDER BY r."createdAt" DESC
        LIMIT :limit
      `, {
        replacements: { limit },
        type: db.sequelize.QueryTypes.SELECT
      });

      return repos;
    } catch (error) {
      logger.error({
        error: error.message
      }, 'Failed to get repositories without activities');
      throw error;
    }
  }

  /**
   * Close database connection
   */
  async close() {
    try {
      await db.sequelize.close();
      logger.info('Database connection closed');
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to close database connection');
      throw error;
    }
  }
}

module.exports = DatabaseService;
