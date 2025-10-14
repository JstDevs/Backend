// models/DocumentAccessModel.js
module.exports = (sequelize, DataTypes) => {
  const DocumentAccessModel = sequelize.define("DocumentAccess", {
    LinkID: {
      type: DataTypes.STRING,
      allowNull: false,
      // field: 'Link ID'
    },
    UserID: {
      type: DataTypes.BIGINT,
      allowNull: false,
      // field: 'User ID'
    },
    View: {
      type: DataTypes.BOOLEAN,
      allowNull: false
    },
    Add: {
      type: DataTypes.BOOLEAN,
      allowNull: false
    },
    Edit: {
      type: DataTypes.BOOLEAN,
      allowNull: false
    },
    Delete: {
      type: DataTypes.BOOLEAN,
      allowNull: false
    },
    Print: {
      type: DataTypes.BOOLEAN,
      allowNull: false
    },
    Confidential: {
      type: DataTypes.BOOLEAN,
      allowNull: false
    },
    Active: {
      type: DataTypes.BOOLEAN,
      allowNull: false
    },
    CreatedBy: {
      type: DataTypes.STRING,
      // field: 'Created By'
    },
    CreatedDate: {
      type: DataTypes.DATE,
      // field: 'Created Date'
    },
    
    fields: {
      type: DataTypes.TEXT, // or DataTypes.STRING(4000) depending on size
      allowNull: false,
      get() {
        const rawValue = this.getDataValue('fields');
        return rawValue ? JSON.parse(rawValue) : null;
      },
      set(value) {
        this.setDataValue('fields', JSON.stringify(value));
      }
      // Example structure:
      // [
      //   { fieldName: 'name', x: 100, y: 150, width: 300, height: 50, type: 'text' },
      //   { fieldName: 'dob', x: 100, y: 210, width: 200, height: 40, type: 'date' }
      // ]
    },
  }, {
    tableName: 'DocumentAccess',
    timestamps: false
  });
  // Define associations if any
  DocumentAccessModel.associate = (models) => {
    // Example: DocumentAccessModel.belongsTo(models.User, { foreignKey: 'UserID' });
    DocumentAccessModel.belongsTo(models.Users, { foreignKey: 'UserID' });
    // Add your associations here
  };
  return DocumentAccessModel;
};
