// models/RegionModel.js
module.exports = (sequelize, DataTypes) => {
  const RegionModel = sequelize.define('Region', {
    ID: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true
    },
    Name: {
      type: DataTypes.STRING,
      allowNull: true
    },
    Active: {
      type: DataTypes.BOOLEAN,
      allowNull: true
    },
    CreatedBy: {
      type: DataTypes.STRING,
      allowNull: true,
      // field: 'Created By'
    },
    CreatedDate: {
      type: DataTypes.DATE,
      allowNull: true,
      // field: 'Created Date'
    },
    ModifyBy: {
      type: DataTypes.STRING,
      allowNull: true,
      // field: 'Modify By'
    },
    ModifyDate: {
      type: DataTypes.DATE,
      allowNull: true,
      // field: 'Modify Date'
    }
  }, {
    tableName: 'Region',
    timestamps: false
  });

  return RegionModel;
};
