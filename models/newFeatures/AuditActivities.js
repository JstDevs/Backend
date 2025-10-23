module.exports = (sequelize, DataTypes) => {
  const AuditActivitiesModel = sequelize.define('AuditActivities', {
    ID: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true
    },
    action: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    user_id: {
      type: DataTypes.BIGINT,
      allowNull: false
    },
    user_name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    document_id: {
      type: DataTypes.BIGINT,
      allowNull: true
    },
    document_name: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    details: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true
    },
    timestamp: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    ip_address: {
      type: DataTypes.STRING(45),
      allowNull: true
    },
    user_agent: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    tableName: 'audit_activities',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    indexes: [
      {
        fields: ['document_id', 'timestamp']
      },
      {
        fields: ['user_id', 'timestamp']
      },
      {
        fields: ['action', 'timestamp']
      }
    ]
  });

  AuditActivitiesModel.associate = function (models) {
    AuditActivitiesModel.belongsTo(models.Users, {
      foreignKey: 'user_id',
      targetKey: 'ID',
      as: 'user'
    });
    
    AuditActivitiesModel.belongsTo(models.Documents, {
      foreignKey: 'document_id',
      targetKey: 'ID',
      as: 'document',
      required: false
    });
  };

  return AuditActivitiesModel;
};
