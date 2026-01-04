require('dotenv').config();

module.exports = {
  // Environment
  env: process.env.NODE_ENV || 'development',
  port: process.env.PORT || 3000,

  // Database Configuration
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'solana_analytics',
    dialect: 'postgres',
    logging: process.env.DB_LOGGING === 'true',
    pool: {
      max: parseInt(process.env.DB_POOL_MAX || '10'),
      min: parseInt(process.env.DB_POOL_MIN || '2'),
      acquire: 30000,
      idle: 10000
    }
  },

  // Redis Configuration (for Bull queue)
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    db: process.env.REDIS_DB || 0
  },

  // GitHub Configuration
  github: {
    tokens: (() => {
      const tokens = [];
      let index = 1;
      while (process.env[`GITHUB_TOKEN_${index}`]) {
        tokens.push(process.env[`GITHUB_TOKEN_${index}`]);
        index++;
      }
      // Fallback to old naming convention
      if (tokens.length === 0) {
        index = 1;
        while (process.env[`GITHUB_ACCESS_TOKEN_${index}`]) {
          tokens.push(process.env[`GITHUB_ACCESS_TOKEN_${index}`]);
          index++;
        }
      }
      return tokens;
    })(),

    // Rate limits per hour for different API endpoints
    rateLimits: {
      core: 5000,        // per token per hour
      search: 30,        // per token per minute
      codeSearch: 10     // per token per minute
    },

    // Request configuration
    requestTimeout: 30000,
    retryAttempts: 3,
    retryDelay: 1000
  },

  // Ecosystem Configuration
  ecosystem: process.env.ECOSYSTEM || 'solana',

  // Search Queries for Solana
  solanaSearchQueries: [
    // JavaScript/TypeScript
    { filename: 'package.json', keyword: 'xyz/anchor', type: 'anchor.js' },
    { filename: 'package-lock.json', keyword: 'xyz/anchor', type: 'anchor.js' },
    { filename: 'yarn.lock', keyword: 'xyz/anchor', type: 'anchor.js' },
    { filename: 'package.json', keyword: 'solana/web3.js', type: 'web3.js' },
    { filename: 'package-lock.json', keyword: 'solana/web3.js', type: 'web3.js' },
    { filename: 'yarn.lock', keyword: 'solana/web3.js', type: 'web3.js' },
    { filename: 'package.json', keyword: 'serum/anchor', type: 'anchor.js' },
    { filename: 'package.json', keyword: 'metaplex/js', type: 'nft' },
    { filename: 'package.json', keyword: 'solana-agent-kit', type: 'ai' },

    // Rust
    { filename: 'Cargo.toml', keyword: 'solana-program', type: 'native' },
    { filename: 'Cargo.toml', keyword: 'anchor-lang', type: 'anchor' },
    { filename: 'Cargo.toml', keyword: 'solana-sdk', type: 'native' },
    { extension: 'rs', keyword: 'solana-program', type: 'native' },
    { extension: 'rs', keyword: 'anchor-lang', type: 'anchor' },

    // Other languages
    { extension: 'go', keyword: 'gagliardetto/solana-go', type: 'go' },
    { filename: 'pyproject.toml', keyword: 'solana', type: 'python' },
    { extension: 'csproj', keyword: 'Solnet.Rpc', type: 'dotnet' },
    { extension: 'cs', keyword: 'Solana.Unity.SDK', type: 'unity' }
  ],

  // Repository search keywords (broader search)
  repositorySearchKeywords: [
    'solana blockchain',
    'solana dapp',
    'solana defi',
    'solana nft',
    'solana web3',
    'anchor framework',
    'solana program',
    'solana smart contract'
  ],

  // Worker Configuration
  workers: {
    repoDiscovery: {
      enabled: true,
      concurrency: 3,
      batchSize: 100,
      intervalMs: 60000 // 1 minute
    },
    developerFetch: {
      enabled: true,
      concurrency: 5,
      batchSize: 50,
      intervalMs: 120000 // 2 minutes
    },
    repoDetails: {
      enabled: true,
      concurrency: 10,
      batchSize: 100
    }
  },

  // Monitoring
  metrics: {
    enabled: true,
    port: process.env.METRICS_PORT || 9090
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    pretty: process.env.NODE_ENV !== 'production'
  }
};
