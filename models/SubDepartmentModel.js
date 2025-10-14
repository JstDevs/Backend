// models/SubDepartmentModel.js
module.exports = (sequelize, DataTypes) => {
  const SubDepartmentModel = sequelize.define('SubDepartment', {
    ID: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    Code: {
      type: DataTypes.STRING,
      allowNull: true
    },
    Name: {
      type: DataTypes.STRING,
      allowNull: true
    },
    Active: {
      type: DataTypes.BOOLEAN,
      allowNull: false
    },
    CreatedBy: {
      type: DataTypes.STRING,
      allowNull: true,
      
    },
    CreatedDate: {
      type: DataTypes.DATE,
      allowNull: true,
      // field: 'Created Date'
    },
    ModifyBy: {
      type: DataTypes.STRING,
      allowNull: true,
      // field: 'Modify By'
    },
    ModifyDate: {
      type: DataTypes.DATE,
      allowNull: true,
      // field: 'Modify Date'
    },
    DepartmentID: {
      type: DataTypes.INTEGER,
      allowNull: false
    }
  }, {
    tableName: 'SubDepartment',
    timestamps: false
  });
  SubDepartmentModel.associate = function (models) {
    SubDepartmentModel.belongsTo(models.Department, { foreignKey: 'DepartmentID' });
  }

  return SubDepartmentModel;
};
