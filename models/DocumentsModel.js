const SubDepartmentModel = require("./SubDepartmentModel");

// models/DocumentsModel.js
module.exports = (sequelize, DataTypes) => {
  const DocumentsModel = sequelize.define('Documents', {
    ID: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true
    },
    LinkID: {
  type: DataTypes.STRING,
  allowNull: false,
 
},
  DepartmentId: {
      type: DataTypes.BIGINT,
      allowNull: false
    },
    SubDepartmentId: {
      type: DataTypes.BIGINT,
      allowNull: false
    },
    DataImage: {
      type: DataTypes.BLOB('long'),
      // field: 'Data Image'
    },
    DataName: {
      type: DataTypes.STRING,
      // field: 'Data Name'
    },
    DataType: {
      type: DataTypes.STRING,
      // field: 'Data Type'
    },
    FileName: {
      type: DataTypes.STRING,
      // field: 'File Name'
    },
    FileDescription: {
      type: DataTypes.STRING,
      // field: 'File Name'
    },
    Description: {
      type: DataTypes.STRING,
      // field: 'File Name'
    },
    FileDate: {
      type: DataTypes.DATE,
      // field: 'File Date'
    },

    Text1: DataTypes.STRING,
    Date1: DataTypes.DATE,
    Text2: DataTypes.STRING,
    Date2: DataTypes.DATE,
    Text3: DataTypes.STRING,
    Date3: DataTypes.DATE,
    Text4: DataTypes.STRING,
    Date4: DataTypes.DATE,
    Text5: DataTypes.STRING,
    Date5: DataTypes.DATE,
    Text6: DataTypes.STRING,
    Date6: DataTypes.DATE,
    Text7: DataTypes.STRING,
    Date7: DataTypes.DATE,
    Text8: DataTypes.STRING,
    Date8: DataTypes.DATE,
    Text9: DataTypes.STRING,
    Date9: DataTypes.DATE,
    Text10: DataTypes.STRING,
    Date10: DataTypes.DATE,
    Expiration: DataTypes.BOOLEAN,
    ExpirationDate: {
      type: DataTypes.DATE,
      // field: 'Expiration Date'
    },
    Confidential: DataTypes.BOOLEAN,
    PageCount: {
      type: DataTypes.INTEGER,
      // field: 'Page Count'
    },
    Remarks: DataTypes.STRING,
    Active: DataTypes.BOOLEAN,
    Createdby: {
      type: DataTypes.STRING,
      // field: 'Created By'
    },
    CreatedDate: {
      type: DataTypes.DATE,
      // field: 'Created Date'
    },
    
    publishing_status:{
      type: DataTypes.BOOLEAN,
      // allowNull: false,
      // defaultValue: false
    }
  }, {
    tableName: 'Documents',
    timestamps: false
  });
// Document Versions
   DocumentsModel.associate = function(models) {{
        // DocumentsModel.belongsTo(models.Module, { foreignKey: 'ModuleID', targetKey: 'ID',as: 'module', });


        // DocumentsModel.hasMany(models.DocumentVersions, { foreignKey: 'LinkID',targetKey:'LinkID', as: 'versions' });
        // DocumentVersionsModel.belongsTo(DocumentsModel, { foreignKey: 'DocumentID', as: 'document' });

        // // Document Collaborations
        // DocumentsModel.hasMany(models.DocumentCollaborations, { foreignKey: 'LinkID', as: 'collaborations' });
        // // DocumentCollaborationsModel.belongsTo(DocumentsModel, { foreignKey: 'LinkID', as: 'document' });

        // // Document Comments
        // DocumentsModel.hasMany(models.DocumentComments, { foreignKey: 'LinkID', as: 'comments' });
        // // models.DocumentCommentsModel.belongsTo(DocumentsModel, { foreignKey: 'LinkID', as: 'document' });
        // // models.DocumentCommentsModel.hasMany(models.DocumentCommentsModel, { foreignKey: 'ParentCommentID', as: 'replies' });
        // // models.DocumentCommentsModel.belongsTo(models.DocumentCommentsModel, { foreignKey: 'ParentCommentID', as: 'parent' });

        // // Document Approvals
        // DocumentsModel.hasMany(models.DocumentApprovals, { foreignKey: 'LinkID', as: 'approvals' });
        // // DocumentApprovalsModel.belongsTo(DocumentsModel, { foreignKey: 'LinkID', as: 'document' });
        // // DocumentsModel.hasMany(models.DocumentApprovals, { foreignKey: 'VersionID', as: 'approvals' });
        // // DocumentApprovalsModel.belongsTo(DocumentVersionsModel, { foreignKey: 'VersionID', as: 'version' });

        // // Document Audit Trail
        // DocumentsModel.hasMany(models.DocumentAuditTrail, { foreignKey: 'LinkID', as: 'auditTrail' });
        // // DocumentAuditTrailModel.belongsTo(DocumentsModel, { foreignKey: 'LinkID', as: 'document' });

        // // Document Restrictions
        // DocumentsModel.hasMany(models.DocumentRestrictions, { foreignKey: 'LinkID', as: 'restrictions' });
        // // DocumentRestrictionsModel.belongsTo(DocumentsModel, { foreignKey: 'LinkID', as: 'document' });

        // // Collaborator Activities
        // DocumentsModel.hasMany(models.CollaboratorActivities, { foreignKey: 'LinkID', as: 'collaboratorActivities' });
        // // CollaboratorActivitiesModel.belongsTo(DocumentsModel, { foreignKey: 'LinkID', as: 'document' });

       
    }};
  return DocumentsModel;
};
