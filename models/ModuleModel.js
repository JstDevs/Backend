// models/module.js

module.exports = (sequelize, DataTypes) => {
  const Module = sequelize.define('Module', {
    ID: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true,
    },
    Description: {
      type: DataTypes.STRING,
      allowNull: true,
    }
  }, {
    tableName: 'Modules', // You can change this to your actual table name
    timestamps: false // Assuming there are no createdAt/updatedAt fields
  });

  return Module;
};
