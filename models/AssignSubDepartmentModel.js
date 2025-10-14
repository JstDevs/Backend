// models/AssignSubDepartmentModel.js

module.exports = (sequelize, DataTypes) => {
  const AssignSubDepartment = sequelize.define("AssignSubDepartment", {
    LinkID: {
      type: DataTypes.STRING,
      primaryKey: true,
      // field: "Link ID"
    },
    DepartmentID: {
      type: DataTypes.INTEGER,
      allowNull: false,
      // field: "Department ID"
    },
    SubDepartmentID: {
      type: DataTypes.INTEGER,
      allowNull: false,
      // field: "Subdepartment ID"
    },
    UserID: {
      type: DataTypes.INTEGER,
      allowNull: false,
      // field: "Subdepartment ID"
    },
    Active: {
      type: DataTypes.BOOLEAN,
      allowNull: false
    },
    CreatedBy: {
      type: DataTypes.STRING,
      allowNull: true,
      // field: "Created By"
    },
    CreatedDate: {
      type: DataTypes.DATE,
      allowNull: false,
      // field: "Created Date"
    }
  }, {
    tableName: "Assign Subdepartment", // quoted because of space
    timestamps: false // No updatedAt/createdAt fields unless added explicitly
  });

  // Define associations if any
  AssignSubDepartment.associate = (models) => {
    // Example: AssignSubDepartment.belongsTo(models.Department, { foreignKey: 'DepartmentID' });
    AssignSubDepartment.belongsTo(models.Department, { foreignKey: 'DepartmentID', targetKey: 'ID' });
    AssignSubDepartment.belongsTo(models.SubDepartment, { foreignKey: 'SubDepartmentID', targetKey: 'ID' });

    // Add your associations here
  };
  return AssignSubDepartment;
};
