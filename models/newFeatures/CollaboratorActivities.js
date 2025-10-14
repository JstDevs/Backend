module.exports = (sequelize, DataTypes) => {
  const CollaboratorActivitiesModel = sequelize.define('CollaboratorActivities', {
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
    CollaboratorID: {
      type: DataTypes.BIGINT,
      allowNull: false
    },
    // ActivityType: {
    //   type: DataTypes.ENUM(
    //     'DOCUMENT_OPENED', 'DOCUMENT_CLOSED', 'COMMENT_ADDED', 
    //     'COMMENT_EDITED', 'COMMENT_DELETED', 'DOCUMENT_EDITED',
    //     'DOCUMENT_DOWNLOADED', 'DOCUMENT_SHARED', 'VERSION_VIEWED','DOCUMENT_CREATED'
    //   ),
    //   allowNull: false
    // },
    DocumentCollaborationID:{
        type: DataTypes.BIGINT,
      allowNull: true,
    },
    ActivityType: {
      type: DataTypes.STRING,
      allowNull: false
    },
    ActivityDate: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    Duration: {
      type: DataTypes.INTEGER,
      allowNull: true,

    },
    PageViewed: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    ActivityDetails: {
      type: DataTypes.TEXT,
      allowNull: true,
       get() {
            const rawValue = this.getDataValue('ActivityDetails');
            return rawValue ? JSON.parse(rawValue) : null;
        },
        set(value) {
            this.setDataValue('ActivityDetails', JSON.stringify(value));
        }
    },
    IPAddress: {
      type: DataTypes.STRING,
      allowNull: true
    },
    DeviceInfo: {
      type: DataTypes.STRING,
      allowNull: true
    }
  }, {
    tableName: 'CollaboratorActivities',
    timestamps: false,
    // indexes: [
    //   {
    //     fields: ['DocumentID', 'CollaboratorID', 'ActivityDate']
    //   }
    // ]
  });

  return CollaboratorActivitiesModel;
};