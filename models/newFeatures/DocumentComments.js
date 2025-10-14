module.exports = (sequelize, DataTypes) => {
  const DocumentCommentsModel = sequelize.define('DocumentComments', {
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
    CollaboratorID: {
      type: DataTypes.BIGINT,
      allowNull: false
    },
    CollaboratorName: {
      type: DataTypes.STRING,
      allowNull: false
    },
    Comment: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    CommentType: {
      type: DataTypes.STRING,
      
    },
    ParentCommentID: {
      type: DataTypes.BIGINT,
      allowNull: true,
      references: {
        model: 'DocumentComments',
        key: 'ID'
      }
    },
     LinkID: {
      type: DataTypes.STRING,
      allowNull: false,
      // unique: true
    },
    PageNumber: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    Position: {
      type: DataTypes.TEXT,
      allowNull: true,
      get() {
        const rawValue = this.getDataValue('Position');
        return rawValue ? JSON.parse(rawValue) : null;
      },
      set(value) {
        this.setDataValue('Position', JSON.stringify(value));
      }
    },
    CommentDate: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    IsResolved: {
      type: DataTypes.BOOLEAN,
     
    },
    ResolvedBy: {
      type: DataTypes.STRING,
      allowNull: true
    },
    ResolvedDate: {
      type: DataTypes.DATE,
      allowNull: true
    },
    Active: {
      type: DataTypes.BOOLEAN,
      // defaultValue: true
    }
  }, {
    tableName: 'DocumentComments',
    timestamps: false
  });
DocumentCommentsModel.associate = function (models) {
  DocumentCommentsModel.belongsTo(models.Users,{
    foreignKey: 'CollaboratorID',
    targetKey: 'ID',
    as: 'commenter'
  })
  DocumentCommentsModel.hasMany(models.DocumentComments, {
    foreignKey: 'ParentCommentID',
    as: 'replies'
  });

  DocumentCommentsModel.belongsTo(models.DocumentComments, {
    foreignKey: 'ParentCommentID',
    as: 'parent'
  });
};
  return DocumentCommentsModel;
};
