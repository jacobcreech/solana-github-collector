const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class SolanaGithubRepos extends Model {}

  SolanaGithubRepos.init(
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      repoId: {
        type: DataTypes.STRING,
        unique: true,
        allowNull: false
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false
      },
      url: {
        type: DataTypes.STRING,
        allowNull: false
      },
      owner: {
        type: DataTypes.STRING,
        allowNull: false
      },
      started: {
        type: DataTypes.INTEGER,
        comment: 'Unix timestamp of repository creation'
      },
      ecosystem: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'solana'
      },
      isClosedSource: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
      },
      issuesAndPrs: {
        type: DataTypes.INTEGER,
        defaultValue: 0
      },
      stars: {
        type: DataTypes.INTEGER,
        defaultValue: 0
      }
    },
    {
      sequelize,
      modelName: 'SolanaGithubRepos',
      tableName: 'SolanaGithubRepos',
      timestamps: true,
      indexes: [
        {
          fields: ['repoId']
        },
        {
          fields: ['ecosystem']
        },
        {
          fields: ['owner']
        },
        {
          fields: ['stars']
        }
      ]
    }
  );

  return SolanaGithubRepos;
};
