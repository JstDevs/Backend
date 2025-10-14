// models/ModuleAccessModel.js
module.exports = (sequelize, DataTypes) => {
  const ModuleAccessModel = sequelize.define('ModuleAccess', {
    ID: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true
    },
    UAID: {
      type: DataTypes.BIGINT,
      allowNull: false,
      // field: 'User Access ID'
    },
    ModuleID: {
      type: DataTypes.BIGINT,
      allowNull: false,
      // field: 'Module ID'
    },
    View: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      // defaultValue: false
    },
    Add: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      // defaultValue: false
    },
    Edit: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      // defaultValue: false
    },
    Delete: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      // defaultValue: false
    },
    Print: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      // defaultValue: false
    }
  }, {
    tableName: 'Module Access',
    timestamps: false
  });
 ModuleAccessModel.associate = function(models) {{
        ModuleAccessModel.belongsTo(models.Module, { foreignKey: 'ModuleID', targetKey: 'ID',as: 'module', });
       
    }};
  return ModuleAccessModel;
};
