module.exports = (sequelize, DataTypes) => {
  const Template = sequelize.define('Template', {
     ID: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    departmentId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    subDepartmentId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    imageWidth: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    imageHeight: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    samplePdfPath: {
      type: DataTypes.STRING,
      allowNull: true // store URL or file path
    },
    header:{
  type: DataTypes.STRING,
      allowNull: true // store URL or file path
    },
    fields: {
     
      type: DataTypes.TEXT, // or DataTypes.STRING(4000) depending on size
        allowNull: false,
        get() {
            const rawValue = this.getDataValue('fields');
            return rawValue ? JSON.parse(rawValue) : null;
        },
        set(value) {
            this.setDataValue('fields', JSON.stringify(value));
        }
      // Example structure:
      // [
      //   { fieldName: 'name', x: 100, y: 150, width: 300, height: 50, type: 'text' },
      //   { fieldName: 'dob', x: 100, y: 210, width: 200, height: 40, type: 'date' }
      // ]
    }
  },{
    tableName: 'Templates',
    timestamps: true,
    
  });

  Template.associate = (models) => {
    Template.belongsTo(models.Department, { foreignKey: 'departmentId',targetKey: 'ID' });
    Template.belongsTo(models.SubDepartment, { foreignKey: 'subDepartmentId',targetKey: 'ID' });
  };

  return Template;
};
