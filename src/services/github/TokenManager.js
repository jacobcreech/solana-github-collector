const { Octokit } = require('@octokit/core');
const { restEndpointMethods } = require('@octokit/plugin-rest-endpoint-methods');
const { retry } = require('@octokit/plugin-retry');
const { throttling } = require('@octokit/plugin-throttling');
const logger = require('../../utils/logger');

const MyOctokit = Octokit.plugin(restEndpointMethods, retry, throttling);

class TokenManager {
  constructor(tokens) {
    if (!tokens || tokens.length === 0) {
      throw new Error('No GitHub tokens provided');
    }

    this.tokens = tokens.map((token, index) => ({
      id: index,
      token,
      octokit: new MyOctokit({
        auth: token,
        throttle: {
          onRateLimit: (retryAfter, options, octokit, retryCount) => {
            logger.warn({
              tokenId: index,
              retryAfter,
              retryCount,
              method: options.method,
              url: options.url
            }, 'Rate limit hit');

            // Retry once after rate limit
            if (retryCount < 1) {
              logger.info({ tokenId: index, retryAfter }, 'Retrying after rate limit');
              return true;
            }
            return false;
          },
          onSecondaryRateLimit: (retryAfter, options, octokit) => {
            logger.warn({
              tokenId: index,
              retryAfter,
              method: options.method,
              url: options.url
            }, 'Secondary rate limit hit');
          }
        },
        retry: {
          doNotRetry: ['429'] // Handle rate limits ourselves
        }
      }),
      rateLimits: {
        core: { remaining: 5000, reset: 0, limit: 5000 },
        search: { remaining: 30, reset: 0, limit: 30 },
        graphql: { remaining: 5000, reset: 0, limit: 5000 },
        integration_manifest: { remaining: 5000, reset: 0, limit: 5000 },
        code_search: { remaining: 10, reset: 0, limit: 10 }
      },
      lastUsed: 0,
      isHealthy: true,
      consecutiveErrors: 0
    }));

    this.currentIndex = 0;
    this.rotationLock = false;

    logger.info({ tokenCount: this.tokens.length }, 'TokenManager initialized');
  }

  /**
   * Get rate limit info for a specific token
   */
  async updateRateLimits(tokenIndex) {
    try {
      const token = this.tokens[tokenIndex];
      const response = await token.octokit.request('GET /rate_limit');

      token.rateLimits = response.data.resources;
      token.isHealthy = true;
      token.consecutiveErrors = 0;

      logger.debug({
        tokenId: tokenIndex,
        core: token.rateLimits.core.remaining,
        search: token.rateLimits.search.remaining,
        codeSearch: token.rateLimits.code_search.remaining
      }, 'Rate limits updated');

      return token.rateLimits;
    } catch (error) {
      logger.error({
        tokenId: tokenIndex,
        error: error.message
      }, 'Failed to update rate limits');

      this.tokens[tokenIndex].consecutiveErrors++;
      if (this.tokens[tokenIndex].consecutiveErrors >= 3) {
        this.tokens[tokenIndex].isHealthy = false;
      }

      return null;
    }
  }

  /**
   * Find the best available token for a given API endpoint type
   */
  async getBestToken(apiType = 'core') {
    // Wait if rotation is in progress
    while (this.rotationLock) {
      await this.sleep(100);
    }

    this.rotationLock = true;

    try {
      // First, try to find a token with available quota
      for (let i = 0; i < this.tokens.length; i++) {
        const index = (this.currentIndex + i) % this.tokens.length;
        const token = this.tokens[index];

        if (!token.isHealthy) {
          logger.debug({ tokenId: index }, 'Skipping unhealthy token');
          continue;
        }

        // Update rate limits if they're stale (older than 1 minute)
        const now = Date.now();
        if (now - token.lastUsed > 60000) {
          await this.updateRateLimits(index);
        }

        const rateLimit = token.rateLimits[apiType];

        if (rateLimit && rateLimit.remaining > 0) {
          logger.debug({
            tokenId: index,
            apiType,
            remaining: rateLimit.remaining
          }, 'Selected token');

          token.lastUsed = now;
          this.currentIndex = (index + 1) % this.tokens.length;

          return {
            octokit: token.octokit,
            tokenId: index,
            remaining: rateLimit.remaining
          };
        }

        // If rate limited, check if reset time has passed
        if (rateLimit && rateLimit.reset * 1000 < now) {
          await this.updateRateLimits(index);

          if (token.rateLimits[apiType].remaining > 0) {
            token.lastUsed = now;
            this.currentIndex = (index + 1) % this.tokens.length;

            return {
              octokit: token.octokit,
              tokenId: index,
              remaining: token.rateLimits[apiType].remaining
            };
          }
        }
      }

      // All tokens are rate limited, find the one that resets soonest
      const resetTimes = this.tokens
        .filter(t => t.isHealthy)
        .map((t, idx) => ({
          index: idx,
          resetTime: t.rateLimits[apiType]?.reset * 1000 || Date.now()
        }))
        .sort((a, b) => a.resetTime - b.resetTime);

      if (resetTimes.length === 0) {
        throw new Error('No healthy tokens available');
      }

      const soonestReset = resetTimes[0];
      const waitTime = Math.max(0, soonestReset.resetTime - Date.now()) + 1000;

      logger.warn({
        apiType,
        waitTime,
        tokenId: soonestReset.index
      }, 'All tokens rate limited, waiting for reset');

      await this.sleep(waitTime);

      // Update rate limits and return the token
      await this.updateRateLimits(soonestReset.index);
      const token = this.tokens[soonestReset.index];
      token.lastUsed = Date.now();

      return {
        octokit: token.octokit,
        tokenId: soonestReset.index,
        remaining: token.rateLimits[apiType].remaining
      };

    } finally {
      this.rotationLock = false;
    }
  }

  /**
   * Execute a GitHub API request with automatic token rotation
   */
  async execute(apiType, requestFn) {
    let lastError;
    const maxRetries = this.tokens.length;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const { octokit, tokenId } = await this.getBestToken(apiType);

        const result = await requestFn(octokit);

        // Update rate limits after successful request
        await this.updateRateLimits(tokenId);

        return result;
      } catch (error) {
        lastError = error;

        if (error.status === 403 && error.message.includes('rate limit')) {
          logger.warn({ attempt, error: error.message }, 'Rate limit error, rotating token');
          continue;
        }

        if (error.status === 403 && error.message.includes('secondary rate limit')) {
          logger.warn('Secondary rate limit hit, waiting 60 seconds');
          await this.sleep(60000);
          continue;
        }

        // Don't retry on 4xx errors (except rate limits)
        if (error.status >= 400 && error.status < 500) {
          throw error;
        }

        // Retry on 5xx errors
        if (error.status >= 500) {
          logger.warn({
            attempt,
            status: error.status,
            error: error.message
          }, 'Server error, retrying');
          await this.sleep(2000 * (attempt + 1));
          continue;
        }

        throw error;
      }
    }

    throw lastError || new Error('All token rotation attempts failed');
  }

  /**
   * Get health status of all tokens
   */
  async getHealthStatus() {
    const statuses = await Promise.all(
      this.tokens.map(async (token, index) => {
        await this.updateRateLimits(index);
        return {
          tokenId: index,
          isHealthy: token.isHealthy,
          consecutiveErrors: token.consecutiveErrors,
          rateLimits: {
            core: token.rateLimits.core,
            search: token.rateLimits.search,
            codeSearch: token.rateLimits.code_search
          }
        };
      })
    );

    return statuses;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = TokenManager;
