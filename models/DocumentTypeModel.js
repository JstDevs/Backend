// models/DocumentAccessModel.js
module.exports = (sequelize, DataTypes) => {
  const DocumentTypeModel = sequelize.define("DocumentType", {
     ID: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true
    },
    Type: {
  type: DataTypes.STRING,
  allowNull: false,
 
},
Code: {
  type: DataTypes.STRING,
  allowNull: false,
 
},
  

  }, {
    tableName: 'DocumentType',
    timestamps: true
  });
  // Define associations if any
 
  return DocumentTypeModel;
};
