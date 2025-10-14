// models/DepartmentModel.js

module.exports = (sequelize, DataTypes) => {
  const Department = sequelize.define("Department", {
    ID: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true // Assuming it's auto-incremented
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
      // field: "Created By"
    },
    CreatedDate: {
      type: DataTypes.DATE,
      allowNull: true,
      // field: "Created Date"
    },
    ModifyBy: {
      type: DataTypes.STRING,
      allowNull: true,
      // field: "Modify By"
    },
    ModifyDate: {
      type: DataTypes.DATE,
      allowNull: true,
      // field: "Modify Date"
    }
  }, {
    tableName: "DepartmentModel", // Change this if the actual table name is different
    timestamps: false
  });

  // Define associations if any
  Department.associate = (models) => {
    // Example: Department.hasMany(models.SubDepartment, { foreignKey: 'DepartmentID' });
    Department.hasMany(models.AssignSubDepartment, { foreignKey: 'DepartmentID' });
    Department.hasMany(models.SubDepartment, { foreignKey: 'DepartmentID' });
  
    // Add your associations here
  };


  
  return Department;
};
