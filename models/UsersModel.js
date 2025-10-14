// models/UsersModel.js
module.exports = (sequelize, DataTypes) => {
  const UsersModel = sequelize.define('Users', {
    ID: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true
    },
    EmployeeID: {
      type: DataTypes.BIGINT,
      allowNull: true,
     
    },
    UserName: {
      type: DataTypes.STRING,
      allowNull: true,
      
    },
    Password: {
      type: DataTypes.STRING,
      allowNull: true
    },
    UserAccessID: {
      type: DataTypes.BIGINT,
      allowNull: true,
      
    },

    userAccessArray: {
      type: DataTypes.TEXT, // or DataTypes.STRING(4000) depending on size
      allowNull: false,
      get() {
        const rawValue = this.getDataValue('userAccessArray');
        return rawValue ? JSON.parse(rawValue) : null;
      },
      set(value) {
        this.setDataValue('userAccessArray', JSON.stringify(value));
      }
      // Example structure:
      // [
      //   { fieldName: 'name', x: 100, y: 150, width: 300, height: 50, type: 'text' },
      //   { fieldName: 'dob', x: 100, y: 210, width: 200, height: 40, type: 'date' }
      // ]
    },
    Active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      
    },
    CreatedBy: {
      type: DataTypes.STRING,
      allowNull: true,
      
    },
    CreatedDate: {
      type: DataTypes.DATE,
      allowNull: false,
     
    }
  }, {
    tableName: 'Users',
    timestamps: false
  });
 UsersModel.associate = function(models) {{
        // UsersModel.belongsTo(models.UserAccess, { foreignKey: 'UserAccessID', targetKey: 'ID',as: 'userAccess', });
       UsersModel.belongsToMany(models.UserAccess, {
        through: models.UserUserAccess,
        foreignKey: 'UserID',
        otherKey: 'UserAccessID',
        as: 'accessList'
      });
    }};
  return UsersModel;
};
