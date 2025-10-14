const { Sequelize } = require('sequelize');

const db = {};

// let sequelize;

// const sequelize = new Sequelize('temp3', 'sa', 'YourPass123@', {
//   host: 'localhost',
//   dialect: 'mssql',
//   dialectOptions: {
//     instanceName: 'SQLEXPRESS', // 🟢 THIS IS REQUIRED
//     options: {
//       trustServerCertificate: true
//     }
//   },
//   logging: false
// });


// const sequelize = new Sequelize('temp3', 'root', '', {
//   host: 'localhost',
//   dialect: 'mysql',
//   dialectOptions: {
//     // instanceName: 'SQLEXPRESS', // 🟢 THIS IS REQUIRED
//     // options: {
//     //   trustServerCertificate: true
//     // }
//   },
//   logging: false
// });



const sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD, {
  host: process.env.DB_HOST,
  dialect: 'mysql',
  // dialect: 'mssql', // Use 'mssql' for Microsoft SQL Server
  // dialect: 'mysql', // Use 'mysql' for MySQL
  port: process.env.DB_PORT || 3306, // Default port for MSSQL is 1433
  dialectOptions: {
    // instanceName: 'SQLEXPRESS', // 🟢 THIS IS REQUIRED
    options: {
      trustServerCertificate: true,
      packetSize: 8192, // Optional: Adjust packet size if needed
    }
  },
  logging: false
});

sequelize.authenticate()
  .then(async() => {
    await db.UserAccess.initialize();
    console.log('✅ Connection has been established successfully.');
  })
  .catch(err => {
    console.error('❌ Unable to connect to the database:', err.message);
  });

let models = [
  require("../models/AssignSubDepartmentModel"), // Adjust the path as necessary
  require("../models/AttachmentModel"), 
  require("../models/BarangayModel"),
  require("../models/DepartmentModel"),
  require("../models/DocumentAccessModel"),
  require("../models/DocumentsModel"),
  require("../models/FieldsModel"),
  require("../models/LGUModel"),
  require("../models/ModuleAccessModel"),
  require("../models/MunicipalityModel"),
  require("../models/RegionModel"),
  require("../models/SubDepartmentModel"),
  require("../models/UserAccessModel"),
  require("../models/UsersModel"),
  require("../models/ModuleModel"),
  require("../models/Template"),
  require("../models/Unrecorded"),
  require("../models/newFeatures/CollaboratorActivities"),
  require("../models/newFeatures/DocumentApprovals"),
  require("../models/newFeatures/DocumentAuditTrail"),
  require("../models/newFeatures/DocumentCollaborations"),
  require("../models/newFeatures/DocumentComments"),
  require("../models/newFeatures/DocumentRestrictions"),
  require("../models/newFeatures/DocumentVersions"),
  require("../models/DocumentTypeModel"),
  require("../models/OCRavalibleFields"),
  require("../models/OCRDocumentReadFields"),
  require("../models/Useruseraccess"),
  require("../models/newFeatures/DocumentApprovers"),
  require("../models/newFeatures/approvalmatrix")
  // require('./yourModelFile') — add models here
];

// // Initialize models
models.forEach(model => {
  const seqModel = model(sequelize, Sequelize);
  db[seqModel.name] = seqModel;
});

// Apply associations
Object.keys(db).forEach(key => {
  if ('associate' in db[key]) {
    db[key].associate(db);
  }
});

db.sequelize = sequelize;
db.Sequelize = Sequelize;

// Optional: sync models to DB

// sequelize.sync({
  // force: true, // Set to true to drop and recreate tables
  // alter: true // Set to true to update existing tables
// }).then(() => {
  // console.log('✅ All models were synchronized successfully.');
// }).catch(err => {
  // console.error('❌ Error synchronizing models:', err);
// });

module.exports = db;
