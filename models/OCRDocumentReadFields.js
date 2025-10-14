// models/DocumentAccessModel.js
module.exports = (sequelize, DataTypes) => {
  const OCRDocumentReadFieldsModel = sequelize.define("OCRDocumentReadFields", {
     ID: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true
    },
    Field: {
  type: DataTypes.STRING,
  allowNull: false,
 
},
Value: {
  type: DataTypes.STRING,
  allowNull: false,
 
},
DocumentID: {
  type: DataTypes.STRING,
  allowNull: false,
 
},
LinkId: {
  type: DataTypes.STRING,
  allowNull: false,
 
},
  template_id: {
    type: DataTypes.BIGINT,
    allowNull: false
  }
}, {
  tableName: 'OCRDocumentReadFields',
  timestamps: true
});
  // Define associations if any
 
  return OCRDocumentReadFieldsModel;
};
