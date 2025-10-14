// models/DocumentAccessModel.js
module.exports = (sequelize, DataTypes) => {
  const OCRavalibleFieldsModel = sequelize.define("OCRavalibleFields", {
     ID: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true
    },
    Field: {
  type: DataTypes.STRING,
  allowNull: false,
 
},
  

  }, {
    tableName: 'OCRavalibleFields',
    timestamps: true
  });
  // Define associations if any
 
  return OCRavalibleFieldsModel;
};
