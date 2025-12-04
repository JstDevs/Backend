module.exports = (sequelize, DataTypes) => {
  const DocumentRestrictionsModel = sequelize.define('DocumentRestrictions', {
    ID: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true
    },
    DocumentID: {
      type: DataTypes.BIGINT,
      allowNull: false,
      references: {
        model: 'Documents',
        key: 'ID'
      }
    },
     LinkID: {
      type: DataTypes.STRING,
      allowNull: false,
      // unique: true
    },
    UserID: {
      type: DataTypes.STRING,
      allowNull: true
    },
    UserRole: {
      type: DataTypes.STRING,
      allowNull: true
    },
    restrictionType:{
      type: DataTypes.STRING,
      allowNull: true
    },
    Field:{
      type: DataTypes.STRING,
      allowNull: true
    },
    xaxis:{
      type: DataTypes.STRING,
      allowNull: true
    },
    yaxis:{
      type: DataTypes.STRING,
      allowNull: true
    },
    width:{
      type: DataTypes.STRING,
      allowNull: true
    },
    height:{
      type: DataTypes.STRING,
      allowNull: true
    },
    pageNumber: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    // UserGroup: {
    //   type: DataTypes.STRING,
    //   allowNull: true
    // },
    // RestrictedFields: {
    //   type: DataTypes.TEXT,
    //   allowNull: false,
    //   defaultValue: JSON.stringify([]),
    //    get() {
    //     const rawValue = this.getDataValue('RestrictedFields');
    //     return rawValue ? JSON.parse(rawValue) : [];
    //   },
    //   set(value) {
    //     this.setDataValue('RestrictedFields', JSON.stringify(value));
    //   }
    // },
    // AllowedActions: {
    //   type: DataTypes.TEXT,
    //   allowNull: false,
    //   defaultValue: JSON.stringify(['READ']),
    //   get() {
    //     const rawValue = this.getDataValue('AllowedActions');
    //     return rawValue ? JSON.parse(rawValue) : [];
    //   },
    //   set(value) {
    //     this.setDataValue('AllowedActions', JSON.stringify(value));
    //   }
    // },
    // DeniedActions: {
    //   type: DataTypes.TEXT,
    //   allowNull: false,
    //   defaultValue: JSON.stringify([]), 
    //   get() {
    //     const rawValue = this.getDataValue('DeniedActions');
    //     return rawValue ? JSON.parse(rawValue) : [];
    //   },
    //   set(value) {
    //     this.setDataValue('DeniedActions', JSON.stringify(value));
    //   }
    // },
    // RestrictionType: {
    //   type: DataTypes.ENUM('FIELD_LEVEL', 'ACTION_LEVEL', 'TIME_BASED', 'CONDITIONAL'),
    //   allowNull: false,
    //   defaultValue: 'FIELD_LEVEL'
    // },
    // Conditions: {
    //   type: DataTypes.TEXT,
    //   allowNull: true,
    //   get() {
    //     const rawValue = this.getDataValue('Conditions');
    //     return rawValue ? JSON.parse(rawValue) : [];
    //   },
    //   set(value) {
    //     this.setDataValue('Conditions', JSON.stringify(value));
    //   }
    // },
    // StartDate: {
    //   type: DataTypes.DATE,
    //   allowNull: true
    // },
    // EndDate: {
    //   type: DataTypes.DATE,
    //   allowNull: true
    // },
    CreatedBy: {
      type: DataTypes.STRING,
      allowNull: false
    },
    CreatedDate: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    Reason: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    // Active: {
    //   type: DataTypes.BOOLEAN,
    //   defaultValue: true
    // }
  }, {
    tableName: 'DocumentRestrictions',
    timestamps: false,
    indexes: [
      {
        fields: ['DocumentID', 'UserID']
      },
      {
        fields: ['DocumentID', 'UserRole']
      }
    ]
  });

  return DocumentRestrictionsModel;
};
