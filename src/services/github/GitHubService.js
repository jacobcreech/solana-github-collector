const TokenManager = require('./TokenManager');
const logger = require('../../utils/logger');
const config = require('../../config');

class GitHubService {
  constructor() {
    if (config.github.tokens.length === 0) {
      throw new Error('No GitHub tokens configured');
    }

    this.tokenManager = new TokenManager(config.github.tokens);
    logger.info('GitHubService initialized');
  }

  /**
   * Search for repositories using code search
   * More precise but has lower rate limits (10/min per token)
   */
  async searchCode({ filename, extension, keyword, sizeRange, inLocation, perPage = 100, page = 1 }) {
    let query = '';

    if (filename) query += `filename:${filename}`;
    if (extension) query += `${query ? '+' : ''}extension:${extension}`;
    if (keyword) query += `${query ? '+' : ''}${keyword}`;
    if (sizeRange) query += `${query ? '+' : ''}size:${sizeRange}`;
    if (inLocation) query += `${query ? '+' : ''}in:${inLocation}`;

    logger.debug({ query, page }, 'Searching code');

    try {
      const response = await this.tokenManager.execute('code_search', async (octokit) => {
        return await octokit.request('GET /search/code', {
          q: query,
          per_page: perPage,
          page
        });
      });

      return {
        items: response.data.items || [],
        totalCount: response.data.total_count || 0,
        incomplete: response.data.incomplete_results || false
      };
    } catch (error) {
      logger.error({ error: error.message, query }, 'Code search failed');
      throw error;
    }
  }

  /**
   * Search for repositories using repository search
   * Less precise but has better rate limits (30/min per token)
   */
  async searchRepositories({ keywords, language, stars, pushed, perPage = 100, page = 1 }) {
    let query = keywords;

    if (language) query += ` language:${language}`;
    if (stars) query += ` stars:${stars}`;
    if (pushed) query += ` pushed:${pushed}`;

    logger.debug({ query, page }, 'Searching repositories');

    try {
      const response = await this.tokenManager.execute('search', async (octokit) => {
        return await octokit.request('GET /search/repositories', {
          q: query,
          per_page: perPage,
          page,
          sort: 'stars',
          order: 'desc'
        });
      });

      return {
        items: response.data.items || [],
        totalCount: response.data.total_count || 0,
        incomplete: response.data.incomplete_results || false
      };
    } catch (error) {
      logger.error({ error: error.message, query }, 'Repository search failed');
      throw error;
    }
  }

  /**
   * Get repository details
   */
  async getRepository({ owner, repo }) {
    try {
      const response = await this.tokenManager.execute('core', async (octokit) => {
        return await octokit.request('GET /repos/{owner}/{repo}', {
          owner,
          repo
        });
      });

      return response.data;
    } catch (error) {
      if (error.status === 404) {
        logger.debug({ owner, repo }, 'Repository not found');
        return null;
      }
      logger.error({ error: error.message, owner, repo }, 'Failed to get repository');
      throw error;
    }
  }

  /**
   * Get repository contributors with their activity stats
   */
  async getContributorsActivity({ owner, repo }) {
    try {
      const response = await this.tokenManager.execute('core', async (octokit) => {
        return await octokit.request('GET /repos/{owner}/{repo}/stats/contributors', {
          owner,
          repo
        });
      });

      // GitHub returns 202 when stats are being computed
      if (response.status === 202) {
        logger.debug({ owner, repo }, 'Stats being computed, waiting');
        await this.sleep(2000);
        return await this.getContributorsActivity({ owner, repo });
      }

      return response.data || [];
    } catch (error) {
      if (error.status === 404) {
        logger.debug({ owner, repo }, 'Repository or stats not found');
        return null;
      }
      logger.error({ error: error.message, owner, repo }, 'Failed to get contributor activity');
      throw error;
    }
  }

  /**
   * Get repository contributors (paginated)
   */
  async getContributors({ owner, repo, perPage = 100, page = 1 }) {
    try {
      const response = await this.tokenManager.execute('core', async (octokit) => {
        return await octokit.request('GET /repos/{owner}/{repo}/contributors', {
          owner,
          repo,
          per_page: perPage,
          page
        });
      });

      return response.data || [];
    } catch (error) {
      if (error.status === 404) {
        logger.debug({ owner, repo }, 'Repository or contributors not found');
        return [];
      }
      logger.error({ error: error.message, owner, repo }, 'Failed to get contributors');
      throw error;
    }
  }

  /**
   * Get user information
   */
  async getUser({ username }) {
    try {
      const response = await this.tokenManager.execute('core', async (octokit) => {
        return await octokit.request('GET /users/{username}', {
          username
        });
      });

      return response.data;
    } catch (error) {
      if (error.status === 404) {
        logger.debug({ username }, 'User not found');
        return null;
      }
      logger.error({ error: error.message, username }, 'Failed to get user');
      throw error;
    }
  }

  /**
   * Get repository commits (paginated)
   */
  async getCommits({ owner, repo, since, until, perPage = 100, page = 1 }) {
    try {
      const params = {
        owner,
        repo,
        per_page: perPage,
        page
      };

      if (since) params.since = since;
      if (until) params.until = until;

      const response = await this.tokenManager.execute('core', async (octokit) => {
        return await octokit.request('GET /repos/{owner}/{repo}/commits', params);
      });

      return response.data || [];
    } catch (error) {
      if (error.status === 404) {
        logger.debug({ owner, repo }, 'Repository or commits not found');
        return [];
      }
      logger.error({ error: error.message, owner, repo }, 'Failed to get commits');
      throw error;
    }
  }

  /**
   * Get repository commit activity
   */
  async getCommitActivity({ owner, repo }) {
    try {
      const response = await this.tokenManager.execute('core', async (octokit) => {
        return await octokit.request('GET /repos/{owner}/{repo}/stats/commit_activity', {
          owner,
          repo
        });
      });

      // GitHub returns 202 when stats are being computed
      if (response.status === 202) {
        logger.debug({ owner, repo }, 'Commit stats being computed, waiting');
        await this.sleep(2000);
        return await this.getCommitActivity({ owner, repo });
      }

      return response.data || [];
    } catch (error) {
      if (error.status === 404) {
        logger.debug({ owner, repo }, 'Repository or commit activity not found');
        return [];
      }
      logger.error({ error: error.message, owner, repo }, 'Failed to get commit activity');
      throw error;
    }
  }

  /**
   * Get trending repositories (approximation using search)
   */
  async getTrendingRepositories({ language = 'rust', days = 7, perPage = 100 }) {
    const date = new Date();
    date.setDate(date.getDate() - days);
    const dateString = date.toISOString().split('T')[0];

    return await this.searchRepositories({
      keywords: 'solana',
      language,
      pushed: `>=${dateString}`,
      stars: '>=10',
      perPage
    });
  }

  /**
   * Get health status of all tokens
   */
  async getHealthStatus() {
    return await this.tokenManager.getHealthStatus();
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = GitHubService;
