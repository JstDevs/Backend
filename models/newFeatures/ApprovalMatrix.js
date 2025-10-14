module.exports = (sequelize, DataTypes) => {
  const approvalmatrixModel = sequelize.define('approvalmatrix', {
    ID: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true
    },
    // documentID: {
    //   type: DataTypes.BIGINT,
    //   allowNull: false
    // },
    // depID: {
    //   type: DataTypes.BIGINT,
    //   allowNull: false
    // },
    subDepID: {
      type: DataTypes.BIGINT,
      allowNull: false
    },
    AllorMajority: {
      type: DataTypes.STRING(150),
      allowNull: true
    },
    NumberofApprover: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    Active: {
      type: DataTypes.BOOLEAN,
      allowNull: true
    },
    CreatedBy: {
      type: DataTypes.STRING(250),
      allowNull: true
    },
    CreatedDate: {
      type: DataTypes.DATE,
      allowNull: true
    },
    AlteredBy: {
      type: DataTypes.STRING(250),
      allowNull: true
    },
    AlteredDate: {
      type: DataTypes.DATE,
      allowNull: true
    }

  }, {
    tableName: 'approvalmatrix',
    timestamps: false
  });

  return approvalmatrixModel;
};
