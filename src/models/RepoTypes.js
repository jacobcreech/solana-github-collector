const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class RepoTypes extends Model {}

  RepoTypes.init(
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      repoId: {
        type: DataTypes.STRING,
        allowNull: false,
        references: {
          model: 'SolanaGithubRepos',
          key: 'repoId'
        }
      },
      type: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: 'Type of repository: anchor, web3.js, native, nft, etc.'
      }
    },
    {
      sequelize,
      modelName: 'RepoTypes',
      tableName: 'RepoTypes',
      timestamps: true,
      indexes: [
        {
          fields: ['repoId']
        },
        {
          fields: ['type']
        },
        {
          unique: true,
          fields: ['repoId', 'type']
        }
      ]
    }
  );

  return RepoTypes;
};
