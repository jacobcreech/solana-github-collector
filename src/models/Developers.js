const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Developers extends Model {}

  Developers.init(
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      username: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
      },
      name: {
        type: DataTypes.STRING
      },
      gitUrl: {
        type: DataTypes.STRING
      },
      avatar: {
        type: DataTypes.STRING
      },
      location: {
        type: DataTypes.STRING
      },
      twitter: {
        type: DataTypes.STRING
      }
    },
    {
      sequelize,
      modelName: 'Developers',
      tableName: 'Developers',
      timestamps: true,
      indexes: [
        {
          unique: true,
          fields: ['username']
        }
      ]
    }
  );

  return Developers;
};
