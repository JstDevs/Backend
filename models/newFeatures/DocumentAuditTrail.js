module.exports = (sequelize, DataTypes) => {
  const DocumentAuditTrailModel = sequelize.define('DocumentAuditTrail', {
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
      // unique: true
    },
    // Action: {
    //   type: DataTypes.ENUM(
    //     'CREATED', 'UPDATED', 'DELETED', 'VIEWED', 'DOWNLOADED', 
    //     'UPLOADED', 'SHARED', 'COMMENTED', 'APPROVED', 'REJECTED',
    //     'VERSION_CREATED', 'COLLABORATOR_ADDED', 'COLLABORATOR_REMOVED',
    //     'PERMISSION_CHANGED', 'RESTRICTION_APPLIED', 'RESTRICTION_REMOVED','APPROVAL_REQUESTED'
    //   ),
    //   allowNull: false
    // },
     Action: {
      type: DataTypes.STRING,
      allowNull: true
    },
    ActionBy: {
      type: DataTypes.BIGINT,
      allowNull: false
    },
    ActionDate: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
   OldValues: {
  type: DataTypes.TEXT,
  allowNull: true,
  get() {
    const rawValue = this.getDataValue('OldValues');
    try {
      return rawValue ? JSON.parse(rawValue) : null;
    } catch (err) {
      return {}; // or return [] or null based on your use case
    }
  },
  set(value) {
    this.setDataValue('OldValues', JSON.stringify(value));
  }
},
NewValues: {
  type: DataTypes.TEXT,
  allowNull: true,
  get() {
    const rawValue = this.getDataValue('NewValues');
    try {
      return rawValue ? JSON.parse(rawValue) : null;
    } catch (err) {
      return {};
    }
  },
  set(value) {
    this.setDataValue('NewValues', JSON.stringify(value));
  }
},
ChangedFields: {
  type: DataTypes.TEXT,
  allowNull: true,
  get() {
    const rawValue = this.getDataValue('ChangedFields');
    try {
      return rawValue ? JSON.parse(rawValue) : null;
    } catch (err) {
      return [];
    }
  },
  set(value) {
    this.setDataValue('ChangedFields', JSON.stringify(value));
  }
},

    IPAddress: {
      type: DataTypes.STRING,
      allowNull: true
    },
    UserAgent: {
      type: DataTypes.STRING,
      allowNull: true
    },
    SessionID: {
      type: DataTypes.STRING,
      allowNull: true
    },
    AdditionalData: {
      type: DataTypes.TEXT,
      allowNull: true,
      get() {
        const rawValue = this.getDataValue('AdditionalData');
        return rawValue ? JSON.parse(rawValue) : null;
      },
      set(value) {
        this.setDataValue('AdditionalData', JSON.stringify(value));
      }
    },
    Description: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    tableName: 'DocumentAuditTrail',
    timestamps: false,
    indexes: [
      {
        fields: ['DocumentID', 'ActionDate']
      },
      {
        fields: ['ActionBy', 'ActionDate']
      }
    ]
  });
  DocumentAuditTrailModel.associate = function (models) {
    DocumentAuditTrailModel.belongsTo(models.Users, {
      foreignKey: 'ActionBy',
      targetKey: 'ID',
      as: 'actor'
    });
    

    DocumentAuditTrailModel.belongsTo(models.Documents, {
      foreignKey: 'DocumentID',
      targetKey: 'ID',
      as: 'documentNew'
    });
    // Add other associations if needed
  };
  return DocumentAuditTrailModel;
};