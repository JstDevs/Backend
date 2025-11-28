// models/RoleDocumentAccessModel.js
module.exports = (sequelize, DataTypes) => {
  const RoleDocumentAccessModel = sequelize.define("RoleDocumentAccess", {
    LinkID: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true, // Part of composite primary key
    },
    UserAccessID: {
      type: DataTypes.BIGINT,
      allowNull: false,
      primaryKey: true, // Part of composite primary key
    },
    View: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    Add: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    Edit: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    Delete: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    Print: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    Confidential: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    Comment: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    Collaborate: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    Finalize: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    Masking: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    Active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },
    CreatedBy: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    CreatedDate: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: DataTypes.NOW
    },
    fields: {
      type: DataTypes.TEXT,
      allowNull: true,
      get() {
        const rawValue = this.getDataValue('fields');
        return rawValue ? JSON.parse(rawValue) : null;
      },
      set(value) {
        this.setDataValue('fields', JSON.stringify(value));
      }
    },
  }, {
    tableName: 'RoleDocumentAccess',
    timestamps: false,
    freezeTableName: true,
    // Tell Sequelize we don't want the default 'id' column
    // Since we have composite primary key (LinkID + UserAccessID)
    omitNull: false,
    indexes: [
      {
        unique: true,
        fields: ['LinkID', 'UserAccessID']
      }
    ]
  });
  
  // Explicitly remove the default 'id' attribute that Sequelize automatically adds
  // This must be done after model definition but before associations
  delete RoleDocumentAccessModel.rawAttributes.id;

  // Define associations
  RoleDocumentAccessModel.associate = (models) => {
    RoleDocumentAccessModel.belongsTo(models.UserAccess, { 
      foreignKey: 'UserAccessID', 
      targetKey: 'ID',
      as: 'userAccess'
    });
  };

  return RoleDocumentAccessModel;
};


