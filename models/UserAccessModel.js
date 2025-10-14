// models/UserAccessModel.js
module.exports = (sequelize, DataTypes) => {
  const UserAccessModel = sequelize.define('UserAccess', {
    ID: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true
    },
    Description: {
      type: DataTypes.STRING,
      allowNull: true
    },
    Active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      // defaultValue: true
    },
    Createdby: {
      type: DataTypes.STRING,
      allowNull: true,
      
    },
    CreatedDate: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: DataTypes.NOW
      
    }
  }, {
    tableName: 'UserAccess',
    timestamps: false
  });

  UserAccessModel.initialize = async () => {
    const count = await UserAccessModel.count();
    if (count === 0) {
      await UserAccessModel.create({
        Description: 'Administration',
        Active: true,
        Createdby: 'system',
        CreatedDate: new Date()
      });
      console.log("Default 'Administration' access created in UserAccess table.");
    }
  };
  // Define associations if any
  UserAccessModel.associate = (models) => {
    // Example: UserAccessModel.hasMany(models.ModuleAccess, { foreignKey: 'UAID', as: 'moduleAccess' });
    
     UserAccessModel.belongsToMany(models.Users, {
    through: models.UserUserAccess,
    foreignKey: 'UserAccessID',
    otherKey: 'UserID',
    as: 'users'
  });
    UserAccessModel.hasMany(models.ModuleAccess, { foreignKey: 'UAID', targetKey: 'ID', as: 'moduleAccess' });

    // Add your associations here
  };
  return UserAccessModel;
};
