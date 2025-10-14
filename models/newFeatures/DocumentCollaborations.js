module.exports = (sequelize, DataTypes) => {
  const DocumentCollaborationsModel = sequelize.define('DocumentCollaborations', {
    ID: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true
    },
    DocumentID: {
      type: DataTypes.BIGINT,
      allowNull: false,
      references: {
        model: 'Documents',
        key: 'ID'
      }
    },
     LinkID: {
      type: DataTypes.STRING,
      allowNull: false,

    },
    CollaboratorID: {
      type: DataTypes.BIGINT, // ✅ Match Users.ID
  allowNull: false,
  references: {
    model: 'Users',
    key: 'ID'
  }
    },
    CollaboratorName: {
      type: DataTypes.STRING,
      allowNull: false
    },
   
    PermissionLevel: {
     type: DataTypes.STRING,
  allowNull: false,
  validate: {
    isIn: [['READ', 'WRITE', 'COMMENT', 'ADMIN']]
  
  }
    },
    AddedBy: {
      type: DataTypes.STRING,
      allowNull: false
    },
    AddedDate: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    LastActivity: {
      type: DataTypes.DATE,
      allowNull: true
    },
   Active: {
  type: DataTypes.BOOLEAN,
  allowNull: false,
  // defaultValue: DataTypes.literal('1') // important for MSSQL
}

  }, {
    tableName: 'DocumentCollaborations',
    timestamps: false,
    indexes: [
      {
        fields: ['DocumentID', 'CollaboratorID'],
        unique: true
      }
    ]
  });
  // Associations can be defined here
  DocumentCollaborationsModel.associate = (models) => {
    DocumentCollaborationsModel.hasMany(models.CollaboratorActivities, {
      foreignKey: 'DocumentCollaborationID',
      sourceKey: 'ID',
      as: 'Activities'
    });
    DocumentCollaborationsModel.belongsTo(models.Users, {
      foreignKey: 'CollaboratorID',
      as: 'Collaborator'
    });
    // Add other associations if needed
  };
  return DocumentCollaborationsModel;
};
