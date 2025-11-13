module.exports = (sequelize, DataTypes) => {
  const DocumentApprovalsModel = sequelize.define('DocumentApprovers', {
    ID: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true
    },
   
    
     DepartmentId: {
      type: DataTypes.BIGINT,
      allowNull: false
    },
     SubDepartmentId: {
      type: DataTypes.BIGINT,
      allowNull: false
    },
    SequenceLevel: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1
    },
    Active: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: true
    },
    ApproverID: {
      type: DataTypes.STRING,
      allowNull: false
    },

  }, {
    tableName: 'DocumentApprovers',
    timestamps: true
  });

  return DocumentApprovalsModel;
};
