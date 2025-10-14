// models/AttachmentModel.js

module.exports = (sequelize, DataTypes) => {
  const Attachment = sequelize.define("Attachment", {
    ID: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true // Assuming EF auto-generates it
    },
    LinkID: {
      type: DataTypes.BIGINT,
      allowNull: false,
      // field: "Link ID"
    },
    DataImage: {
      type: DataTypes.BLOB('long'), // For byte[] in EF
      allowNull: true,
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
    tableName: "AttachmentModel", // You can change this if your actual table name is different
    timestamps: false
  });

  return Attachment;
};
