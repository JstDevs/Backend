var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
require("dotenv").config();
const sharp = require('sharp');
const multer=require("multer")
const cors = require('cors');
const fs = require('fs');
const Tesseract = require('tesseract.js');
const db = require("./config/database.js"); // Ensure this path is correct based on your project structure
var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');
const usersRoutes = require('./Controllers/UsersController.js');
const authRoutes = require('./Controllers/auth.js'); // Assuming you have an AuthController for authentication
const userAccess=require("./Controllers/UserAccessController.js")
const department=require("./Controllers/DepartmentController.js")
const subdepartments=require("./Controllers/SubDepartmentController.js")
const documents=require("./Controllers/DocumentsController.js")
const templateController=require("./Controllers/TemplateController.js")
const OCRController = require('./Controllers/OCRController.js'); // Assuming you have an OCRController for OCR processing
const unrecorded = require('./Controllers/UnrecordedController.js'); // Assuming you have an UnrecordedController for unrecorded documents
const AllocationController = require('./Controllers/AllocationController.js'); // Assuming you have an AllocationController for allocation of documents
const BatchUpload= require('./Controllers/BatchUpload.js'); // Assuming you have a BatchUploadController for batch uploads
const ApprovalMatrix= require('./Controllers/ApprovalMatrix.js');
const DocumentApproverController = require('./Controllers/DocumentApproverController.js');
const AuditController = require('./Controllers/AuditController.js');
const FieldsController = require('./Controllers/FieldsController.js');
var app = express();
// const upload = multer({ dest: 'uploads/' });
// view engine setup

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
// Allow all origins (for dev or open API)
// app.use(cors());

// const corsOptions = {
//   origin: 'https://dms-frontend-phi.vercel.app',
//   methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
//   allowedHeaders: ['Content-Type', 'Authorization'],
// };

const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      'https://dms-frontend-phi.vercel.app',
      'https://staging-portal.testthelink.online',
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://192.168.1.215:5173'   // ← IDAGDAG ITO
    ];

    // Allow requests with no origin (Postman, curl, mobile apps)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    } else {
      return callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};
app.use(cors(corsOptions));
// app.options('*', cors(corsOptions));

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/static/public',express.static(path.join(__dirname, 'public/images')));
// app.use(express.static(path.join(__dirname, 'dist')));
app.get('/upload', async (req, res) => {
     try {
    const filePath = path.join(__dirname, "uploads/951dfbe5c46983c7caef348621720a8c"); // Change this to your uploaded file path
    console.log("filePath",filePath)
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: 'File not found' });
    }
    const data = await extractFieldsFromTemplate(filePath, template);
    // fs.unlinkSync(filePath); // cleanup uploaded image
    res.json({ success: true, extracted: data });
  } catch (err) {
    console.error("Error during OCR processing:", err);
    res.status(500).json({ success: false, error: err });
  }
});
app.get('/', (req, res) => {
  res.send(`
    <h2>Welcome</h2>
   
  `);
});
// app.use('/', indexRouter);
app.use('/users', usersRoutes);
app.use('/auth', authRoutes); // Add your authentication routes
app.use('/userAccess', userAccess); // Add your user access routes
app.use('/department', department);
app.use('/subdepartments', subdepartments);
app.use('/documents', documents); // Add your documents routes
app.use('/templates', templateController); // Add your template routes
app.use('/ocr', unrecorded); // Add your OCR processing routes
app.use('/allocation', AllocationController); // Add your allocation routes
app.use('/batchUpload', BatchUpload); // Add your batch upload routes
app.use('/approvalMatrix', ApprovalMatrix); // Add your batch upload routes
app.use('/document-approvers', DocumentApproverController);
app.use('/audit', AuditController); // Add your audit routes
app.use('/fields', FieldsController); // Add your fields routes

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});
// For single-page app routing


// For single-page app routing
app.get('/appp', (req, res) => {
  console.log("req",path.join(__dirname, 'dist', 'index.html'))
  // return
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});
// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});


// Sample hardcoded template for ID card
const template = {
  name: { x: 30, y: 30, width: 180, height: 30 },
  dob:  { x: 30, y: 70, width: 140, height: 30 }
};


// Helper function: Check if OCR word is inside a bounding box
function isInsideTemplateBox(bbox, fieldBox) {
  const [x1, y1, x2, y2] = bbox;
  return (
    x1 >= fieldBox.x &&
    y1 >= fieldBox.y &&
    x2 <= fieldBox.x + fieldBox.width &&
    y2 <= fieldBox.y + fieldBox.height
  );
}

// OCR processing and field extraction
async function extractFields(imagePath, template) {
  console.log("imagePath",imagePath)
  const result = await Tesseract.recognize(imagePath, 'eng', { tessedit_pageseg_mode: 1 });
  const words = result.data.words;
 let extracted = {
    name: '',
    dob: '',
    aadhaar: ''
  };
  if(words){const extracted = {
    name: '',
    dob: ''
  };
  console.log("words",result)

  words.forEach(word => {
    if (isInsideTemplateBox(word.bbox, template.name)) {
      extracted.name += word.text + ' ';
    }
    if (isInsideTemplateBox(word.bbox, template.dob)) {
      extracted.dob += word.text + ' ';
    }
  });

  // Trim spaces
  for (let key in extracted) {
    extracted[key] = extracted[key].trim();
  }
}else if(result.data.text){
    const rawText = result.data.text;
console.log("rawText====>",rawText,"===<")
  // Clean up and normalize the text
  const lines = rawText.split('\n').map(line => line.trim()).filter(Boolean);

  // Initialize result
 

  // Logic: crude pattern matching (improve this per document structure)
  lines.forEach(line => {
    if (/^\d{4} \d{4} \d{4}$/.test(line)) {
      extracted.aadhaar = line;
    } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(line)) {
      extracted.dob = line;
    } else if (!extracted.name && /^[A-Z][a-z]+/.test(line)) {
      extracted.name = line;
    }
  });

  return extracted;
  }

  
}



// Hardcoded template (in pixels)
// const template = {
//   name: { x: 100, y: 200, width: 300, height: 50 },
//   dob:  { x: 100, y: 260, width: 200, height: 50 }
// };

// Function to crop and OCR each field
async function extractFieldsFromTemplate(imagePath, template) {
  const outputDir = './temp';
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);
const metadata = await sharp(imagePath).metadata();
console.log(metadata.width, metadata.height);

  const extracted = {};

  for (const field in template) {
    const box = template[field];
    const cropPath = path.join(outputDir, `${field}.png`);

    // Crop the image
    await sharp(imagePath)
      .extract({
        left: box.x,
        top: box.y,
        width: box.width,
        height: box.height
      })
      .toFile(cropPath);

    // Run OCR on the cropped image
    const result = await Tesseract.recognize(cropPath, 'eng');
    const text = result.data.text.trim().replace(/\s+/g, ' ');
    extracted[field] = text;
  }

  return extracted;
}

// API route: upload and extract data



module.exports = app;
