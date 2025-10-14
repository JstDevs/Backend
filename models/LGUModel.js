// models/LGUModel.js
module.exports = (sequelize, DataTypes) => {
  const LGUModel = sequelize.define('LGU', {
    ID: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true
    },
    Logo: {
      type: DataTypes.BLOB,
      allowNull: true
    },
    Code: {
      type: DataTypes.STRING,
      allowNull: true
    },
    Name: {
      type: DataTypes.STRING,
      allowNull: true
    },
    TIN: {
      type: DataTypes.STRING,
      allowNull: true
    },
    RDO: {
      type: DataTypes.STRING,
      allowNull: true
    },
    PhoneNumber: {
      type: DataTypes.STRING,
      // field: 'Phone Number',
      allowNull: true
    },
    EmailAddress: {
      type: DataTypes.STRING,
      // field: 'Email Address',
      allowNull: true
    },
    Website: {
      type: DataTypes.STRING,
      allowNull: true
    },
    StreetAddress: {
      type: DataTypes.STRING,
      // field: 'Street Address',
      allowNull: true
    },
    BarangayID: {
      type: DataTypes.BIGINT,
      // field: 'Barangay ID',
      allowNull: true
    },
    MunicipalityID: {
      type: DataTypes.BIGINT,
      // field: 'Municipality ID',
      allowNull: true
    },
    RegionID: {
      type: DataTypes.BIGINT,
      // field: 'Region ID',
      allowNull: true
    },
    ZipCode: {
      type: DataTypes.STRING,
      // field: 'ZIP Code',
      allowNull: true
    },
    CreatedBy: {
      type: DataTypes.STRING,
      // field: 'Created By',
      allowNull: true
    },
    CreatedDate: {
      type: DataTypes.DATE,
      // field: 'Created Date',
      allowNull: true
    },
    ModifyBy: {
      type: DataTypes.STRING,
      // field: 'Modify By',
      allowNull: true
    },
    ModifyDate: {
      type: DataTypes.DATE,
      // field: 'Modify Date',
      allowNull: true
    }
  }, {
    tableName: 'LGU',
    timestamps: false
  });

  return LGUModel;
};
