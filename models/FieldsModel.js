// models/FieldsModel.js
module.exports = (sequelize, DataTypes) => {
  const FieldsModel = sequelize.define('Fields', {
    LinkID: {
      type: DataTypes.BIGINT,
      allowNull: false,
      // field: 'Link ID'
    },
    FieldNumber: {
      type: DataTypes.SMALLINT,
      allowNull: false,
      // field: 'Field Number'
    },
    Active: {
      type: DataTypes.BOOLEAN,
      allowNull: false
    },
    FieldID: {
      type: DataTypes.BIGINT,
      allowNull: true
      // Foreign key relationship is defined in database.js associations
    },
    Description: {
      type: DataTypes.STRING,
      allowNull: true
    },
    DataType: {
      type: DataTypes.STRING,
      // field: 'Data Type',
      allowNull: true
    }
  }, {
    tableName: 'Fields',
    timestamps: false,
    createdAt: false,
    updatedAt: false,
    indexes: [],
    // Since [Keyless] is used in C#, we indicate there's no primary key
    hasPrimaryKeys: false
  });

  FieldsModel.removeAttribute('id'); // explicitly remove default id
  return FieldsModel;
};
