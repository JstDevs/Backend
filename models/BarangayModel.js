// models/BarangayModel.js

module.exports = (sequelize, DataTypes) => {
  const Barangay = sequelize.define("Barangay", {
    ID: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true // Assuming it's auto-incremented
    },
    Name: {
      type: DataTypes.STRING,
      allowNull: true
    },
    Active: {
      type: DataTypes.BOOLEAN,
      allowNull: true
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
    tableName: "BarangayModel", // You can rename this if the table name differs
    timestamps: false
  });

  return Barangay;
};
