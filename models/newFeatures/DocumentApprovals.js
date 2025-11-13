module.exports = (sequelize, DataTypes) => {
  const DocumentApprovalsModel = sequelize.define('DocumentApprovals', {
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
    // VersionID: {
    //   type: DataTypes.BIGINT,
    //   allowNull: true,
    //   references: {
    //     model: 'DocumentVersions',
    //     key: 'ID'
    //   }
    // },
    RequestedBy: {
      type: DataTypes.STRING,
      allowNull: false
    },
    RequestedDate: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    ApproverID: {
      type: DataTypes.STRING,
      allowNull: false
    },
    ApproverName: {
      type: DataTypes.STRING,
      allowNull: false
    },
    SequenceLevel: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1
    },
    IsCancelled: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: false
    },
    // ApprovalLevel: {
    //   type: DataTypes.INTEGER,
    //   allowNull: false,
    //   defaultValue: 1
    // },
    // Status: {
    //   type: DataTypes.ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'),
    //   allowNull: false,
    //   defaultValue: 'PENDING'
    // },
      Status: {
      type: DataTypes.STRING,
      allowNull: false,
      // defaultValue: 'PENDING'
    },
    ApprovalDate: {
      type: DataTypes.DATE,
      allowNull: true
    },
    Comments: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    RejectionReason: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    // Priority: {
    //   type: DataTypes.ENUM('LOW', 'MEDIUM', 'HIGH', 'URGENT'),
    //   defaultValue: 'MEDIUM'
    // },
    // DueDate: {
    //   type: DataTypes.DATE,
    //   allowNull: true
    // },
    // NotificationSent: {
    //   type: DataTypes.BOOLEAN,
    //   defaultValue: false
    // },
    // Active: {
    //   type: DataTypes.BOOLEAN,
    //   defaultValue: true
    // }
  }, {
    tableName: 'DocumentApprovals',
    timestamps: false
  });

  return DocumentApprovalsModel;
};
