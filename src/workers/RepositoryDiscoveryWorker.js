const GitHubService = require('../services/github/GitHubService');
const DatabaseService = require('../services/database/DatabaseService');
const config = require('../config');
const logger = require('../utils/logger');

class RepositoryDiscoveryWorker {
  constructor() {
    this.githubService = new GitHubService();
    this.dbService = new DatabaseService();
    this.isRunning = false;
    this.processedRepos = new Set();
  }

  /**
   * Generate size ranges for code search pagination
   */
  generateSizeRanges() {
    const ranges = [];
    let start = 0;

    while (start < 1000) {
      ranges.push(`${start}..${start + 199}`);
      start += 150;
    }

    while (start < 3000) {
      ranges.push(`${start}..${start + 499}`);
      start += 250;
    }

    while (start < 5000) {
      ranges.push(`${start}..${start + 999}`);
      start += 500;
    }

    while (start < 10000) {
      ranges.push(`${start}..${start + 1999}`);
      start += 1000;
    }

    while (start < 15000) {
      ranges.push(`${start}..${start + 4999}`);
      start += 5000;
    }

    return ranges;
  }

  /**
   * Search for repositories using code search
   * This is the original method from analytics service
   */
  async searchByCode() {
    const queries = config.solanaSearchQueries;
    const sizeRanges = this.generateSizeRanges();
    const ecosystem = config.ecosystem;
    let totalFound = 0;

    logger.info('Starting code search for repositories');

    for (const query of queries) {
      const { filename, extension, keyword, type } = query;

      for (const sizeRange of sizeRanges) {
        let page = 1;
        let hasMore = true;

        while (hasMore && page <= 10) {
          try {
            const result = await this.githubService.searchCode({
              filename,
              extension,
              keyword,
              sizeRange,
              perPage: 100,
              page
            });

            if (result.items.length === 0) {
              hasMore = false;
              break;
            }

            logger.debug({
              query: { filename, extension, keyword },
              sizeRange,
              page,
              found: result.items.length
            }, 'Code search results');

            const reposData = await this.processCodeSearchResults(result.items, ecosystem, type);
            totalFound += reposData.length;

            if (result.items.length < 100) {
              hasMore = false;
            }

            page++;
          } catch (error) {
            logger.error({
              error: error.message,
              query: { filename, extension, keyword },
              sizeRange,
              page
            }, 'Code search failed');

            // Continue to next range on error
            break;
          }
        }
      }
    }

    logger.info({ totalFound }, 'Code search completed');
    return totalFound;
  }

  /**
   * Process code search results and save to database
   */
  async processCodeSearchResults(items, ecosystem, type) {
    const reposData = [];
    const repoTypesData = [];

    for (const item of items) {
      const { repository } = item;

      if (!repository || !repository.id || !repository.name) {
        continue;
      }

      const repoKey = `${repository.owner.login}/${repository.name}`;

      if (this.processedRepos.has(repoKey)) {
        continue;
      }

      try {
        // Get detailed repository information
        const repoDetails = await this.githubService.getRepository({
          owner: repository.owner.login,
          repo: repository.name
        });

        if (!repoDetails) {
          continue;
        }

        const repoData = {
          repoId: String(repository.id),
          name: repository.name,
          url: repository.html_url,
          owner: repository.owner.login,
          started: Math.floor(new Date(repoDetails.created_at).getTime() / 1000),
          ecosystem,
          isClosedSource: false,
          issuesAndPrs: repoDetails.open_issues_count || 0,
          stars: repoDetails.stargazers_count || 0
        };

        reposData.push(repoData);

        if (type) {
          repoTypesData.push({
            repoId: String(repository.id),
            type
          });
        }

        this.processedRepos.add(repoKey);

        logger.debug({
          owner: repository.owner.login,
          repo: repository.name,
          stars: repoData.stars
        }, 'Repository processed');

      } catch (error) {
        logger.error({
          error: error.message,
          owner: repository.owner.login,
          repo: repository.name
        }, 'Failed to process repository');
      }
    }

    // Bulk insert to database
    if (reposData.length > 0) {
      try {
        await this.dbService.bulkCreateRepositories(reposData);
        logger.info({ count: reposData.length }, 'Repositories saved to database');
      } catch (error) {
        logger.error({
          error: error.message,
          count: reposData.length
        }, 'Failed to save repositories');
      }
    }

    if (repoTypesData.length > 0) {
      try {
        await this.dbService.bulkCreateRepoTypes(repoTypesData);
        logger.info({ count: repoTypesData.length }, 'Repo types saved to database');
      } catch (error) {
        logger.error({
          error: error.message,
          count: repoTypesData.length
        }, 'Failed to save repo types');
      }
    }

    return reposData;
  }

  /**
   * Search for repositories using repository search
   * This is broader and has better rate limits
   */
  async searchByRepository() {
    const keywords = config.repositorySearchKeywords;
    const ecosystem = config.ecosystem;
    let totalFound = 0;

    logger.info('Starting repository search');

    for (const keyword of keywords) {
      let page = 1;
      let hasMore = true;

      while (hasMore && page <= 10) {
        try {
          const result = await this.githubService.searchRepositories({
            keywords: keyword,
            language: 'rust',
            stars: '>=5',
            perPage: 100,
            page
          });

          if (result.items.length === 0) {
            hasMore = false;
            break;
          }

          logger.debug({
            keyword,
            page,
            found: result.items.length
          }, 'Repository search results');

          const reposData = await this.processRepoSearchResults(result.items, ecosystem);
          totalFound += reposData.length;

          if (result.items.length < 100) {
            hasMore = false;
          }

          page++;
        } catch (error) {
          logger.error({
            error: error.message,
            keyword,
            page
          }, 'Repository search failed');

          break;
        }
      }
    }

    logger.info({ totalFound }, 'Repository search completed');
    return totalFound;
  }

  /**
   * Process repository search results
   */
  async processRepoSearchResults(items, ecosystem) {
    const reposData = [];

    for (const repo of items) {
      const repoKey = `${repo.owner.login}/${repo.name}`;

      if (this.processedRepos.has(repoKey)) {
        continue;
      }

      try {
        // Check if repo already exists in database
        const exists = await this.dbService.repositoryExists(String(repo.id));
        if (exists) {
          this.processedRepos.add(repoKey);
          continue;
        }

        const repoData = {
          repoId: String(repo.id),
          name: repo.name,
          url: repo.html_url,
          owner: repo.owner.login,
          started: Math.floor(new Date(repo.created_at).getTime() / 1000),
          ecosystem,
          isClosedSource: false,
          issuesAndPrs: repo.open_issues_count || 0,
          stars: repo.stargazers_count || 0
        };

        reposData.push(repoData);
        this.processedRepos.add(repoKey);

        logger.debug({
          owner: repo.owner.login,
          repo: repo.name,
          stars: repoData.stars
        }, 'Repository processed from search');

      } catch (error) {
        logger.error({
          error: error.message,
          owner: repo.owner.login,
          repo: repo.name
        }, 'Failed to process repository from search');
      }
    }

    // Bulk insert to database
    if (reposData.length > 0) {
      try {
        await this.dbService.bulkCreateRepositories(reposData);
        logger.info({ count: reposData.length }, 'Repositories from search saved to database');
      } catch (error) {
        logger.error({
          error: error.message,
          count: reposData.length
        }, 'Failed to save repositories from search');
      }
    }

    return reposData;
  }

  /**
   * Search for trending repositories
   */
  async searchTrending() {
    const ecosystem = config.ecosystem;
    logger.info('Searching for trending repositories');

    try {
      const result = await this.githubService.getTrendingRepositories({
        language: 'rust',
        days: 7,
        perPage: 100
      });

      const reposData = await this.processRepoSearchResults(result.items, ecosystem);

      logger.info({
        found: reposData.length
      }, 'Trending search completed');

      return reposData.length;
    } catch (error) {
      logger.error({
        error: error.message
      }, 'Trending search failed');
      return 0;
    }
  }

  /**
   * Run all discovery strategies
   */
  async run() {
    if (this.isRunning) {
      logger.warn('Repository discovery already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting repository discovery worker');

    try {
      // Run different search strategies
      const codeResults = await this.searchByCode();
      const repoResults = await this.searchByRepository();
      const trendingResults = await this.searchTrending();

      logger.info({
        codeSearch: codeResults,
        repoSearch: repoResults,
        trending: trendingResults,
        total: codeResults + repoResults + trendingResults
      }, 'Repository discovery completed');

    } catch (error) {
      logger.error({
        error: error.message
      }, 'Repository discovery failed');
    } finally {
      this.isRunning = false;
    }
  }
}

module.exports = RepositoryDiscoveryWorker;
