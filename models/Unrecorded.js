

module.exports = (sequelize, DataTypes) => {
  const Unrecorded = sequelize.define('Unrecorded', {
  departmentId: { type: DataTypes.INTEGER, allowNull: false },
  subDepartmentId: { type: DataTypes.INTEGER, allowNull: false },
  filePath: { type: DataTypes.STRING, allowNull: false },
  errorMessage: { type: DataTypes.TEXT, allowNull: false },
  originalName: { type: DataTypes.STRING },
  uploadedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
}, {
    tableName: "Unrecorded", // You can change this if your actual table name is different
    timestamps: true
  });

  return Unrecorded;
};
