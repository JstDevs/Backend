// models/UserUserAccess.js
module.exports = (sequelize, DataTypes) => {
  const UserUserAccess = sequelize.define('UserUserAccess', {
    UserID: {
      type: DataTypes.BIGINT,
      references: {
        model: 'Users',
        key: 'ID'
      }
    },
    UserAccessID: {
      type: DataTypes.BIGINT,
      references: {
        model: 'UserAccess',
        key: 'ID'
      }
    }
  }, {
    tableName: 'UserUserAccess',
    timestamps: true
  });

  return UserUserAccess;
};
