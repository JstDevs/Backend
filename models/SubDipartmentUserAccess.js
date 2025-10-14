// models/AttachmentModel.js

module.exports = (sequelize, DataTypes) => {
  const Allocation = sequelize.define("Allocation", {
    ID: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true // Assuming EF auto-generates it
    },
    DepartmentID: {
      type: DataTypes.INTEGER,
      allowNull: false,
      // field: "Link ID"
    },
    SubDepartmentID: {
     type: DataTypes.INTEGER,
      allowNull: false,
      // field: "Data Image"
    },
    DataName: {
      type: DataTypes.STRING,
      allowNull: true,
      // field: "Data Name"
    },
    DataType: {
      type: DataTypes.STRING,
      allowNull: true,
      // field: "Data Type"
    }
  }, {
    tableName: "AllocationModel", // You can change this if your actual table name is different
    timestamps: false
  });

  return Allocation;
};
