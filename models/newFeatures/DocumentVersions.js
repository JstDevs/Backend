module.exports = (sequelize, DataTypes) => {
  const DocumentVersionsModel = sequelize.define('DocumentVersions', {
    ID: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true
    },
    DocumentID: {
      type: DataTypes.BIGINT,
      allowNull: false,
     
    },
 LinkID: {
  type: DataTypes.STRING,
  allowNull: false,
  
},
    VersionNumber: {
      type: DataTypes.STRING,
      allowNull: false
    },
    ModificationDate: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    ModifiedBy: {
      type: DataTypes.STRING,
      allowNull: false
    },
    Changes: {
      type: DataTypes.TEXT,
      allowNull: true,
       get() {
            const rawValue = this.getDataValue('Changes');
            return rawValue ? JSON.parse(rawValue) : null;
        },
        set(value) {
            this.setDataValue('Changes', JSON.stringify(value));
        }
    },
    
    IsCurrentVersion: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    Active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    }
  }, {
    tableName: 'DocumentVersions',
    timestamps: false,
    indexes: [
      {
        fields: ['LinkID', 'IsCurrentVersion'], // ⚡ OPTIMIZATION: Index for fast current version lookups
        name: 'idx_versions_linkid_current'
      },
      {
        fields: ['LinkID', 'ModificationDate'], // ⚡ OPTIMIZATION: Index for fast version lookups
        name: 'idx_versions_linkid_moddate'
      },
      {
        fields: ['DocumentID']
      }
    ]
  });

  return DocumentVersionsModel;
};