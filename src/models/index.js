const { Sequelize } = require('sequelize');
const config = require('../config');
const logger = require('../utils/logger');

// Initialize Sequelize
const sequelize = new Sequelize(
  config.database.database,
  config.database.username,
  config.database.password,
  {
    host: config.database.host,
    port: config.database.port,
    dialect: config.database.dialect,
    logging: config.database.logging ? (msg) => logger.debug(msg) : false,
    pool: config.database.pool
  }
);

// Import models
const SolanaGithubRepos = require('./SolanaGithubRepos')(sequelize, Sequelize.DataTypes);
const Developers = require('./Developers')(sequelize, Sequelize.DataTypes);
const Activities = require('./Activities')(sequelize, Sequelize.DataTypes);
const RepoTypes = require('./RepoTypes')(sequelize, Sequelize.DataTypes);

// Setup associations
SolanaGithubRepos.hasMany(RepoTypes, {
  foreignKey: 'repoId',
  sourceKey: 'repoId',
  onDelete: 'CASCADE'
});

SolanaGithubRepos.hasMany(Activities, {
  foreignKey: 'repositoryId',
  sourceKey: 'id',
  onDelete: 'CASCADE'
});

Developers.hasMany(Activities, {
  foreignKey: 'developerId',
  onDelete: 'CASCADE'
});

Activities.belongsTo(Developers, {
  foreignKey: 'developerId',
  onDelete: 'CASCADE'
});

Activities.belongsTo(SolanaGithubRepos, {
  foreignKey: 'repositoryId',
  targetKey: 'id',
  onDelete: 'CASCADE'
});

RepoTypes.belongsTo(SolanaGithubRepos, {
  foreignKey: 'repoId',
  targetKey: 'repoId',
  onDelete: 'CASCADE'
});

const db = {
  sequelize,
  Sequelize,
  SolanaGithubRepos,
  Developers,
  Activities,
  RepoTypes
};

module.exports = db;
