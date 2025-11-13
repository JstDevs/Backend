module.exports = (sequelize, DataTypes) => {
  const DocumentApprovalTrackingModel = sequelize.define('DocumentApprovalTracking', {
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
      allowNull: false
    },
    DepartmentId: {
      type: DataTypes.BIGINT,
      allowNull: false
    },
    SubDepartmentId: {
      type: DataTypes.BIGINT,
      allowNull: false
    },
    CurrentLevel: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1
    },
    TotalLevels: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    AllorMajority: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'MAJORITY' // 'ALL' or 'MAJORITY'
    },
    FinalStatus: {
      type: DataTypes.STRING(50),
      allowNull: true,
      defaultValue: 'PENDING' // 'PENDING', 'IN_PROGRESS', 'APPROVED', 'REJECTED'
    },
    LevelsCompleted: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    CreatedDate: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: DataTypes.NOW
    },
    UpdatedDate: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'DocumentApprovalTracking',
    timestamps: false
  });

  return DocumentApprovalTrackingModel;
};



