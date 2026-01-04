const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Activities extends Model {}

  Activities.init(
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      commits: {
        type: DataTypes.INTEGER,
        defaultValue: 0
      },
      additions: {
        type: DataTypes.INTEGER,
        defaultValue: 0
      },
      deletions: {
        type: DataTypes.INTEGER,
        defaultValue: 0
      },
      date: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: 'Unix timestamp for the activity week'
      },
      repositoryId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'SolanaGithubRepos',
          key: 'id'
        }
      },
      developerId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'Developers',
          key: 'id'
        }
      }
    },
    {
      sequelize,
      modelName: 'Activities',
      tableName: 'Activities',
      timestamps: true,
      indexes: [
        {
          fields: ['repositoryId']
        },
        {
          fields: ['developerId']
        },
        {
          fields: ['date']
        },
        {
          unique: true,
          fields: ['repositoryId', 'developerId', 'date']
        }
      ]
    }
  );

  return Activities;
};
