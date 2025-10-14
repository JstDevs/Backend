// This file contains the Express.js route handler for batch Excel upload and OCR processing.
// It assumes Sequelize is already configured and its models are available.

// --- Required Imports ---
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs').promises; // Using promises-based fs for async operations
const ExcelJS = require('exceljs'); // Excel file reading/writing
const Tesseract = require('tesseract.js'); // OCR engine wrapper
const { PDFDocument } = require('pdf-lib'); // PDF manipulation (splitting, merging)
const winston = require('winston'); // Logging library
require('dotenv').config();        // Load environment variables from .env
// const { convert } = require('pdf-poppler');
const convertPdfBufferToImages=require("../utils/pdftoimages_1")
const pdf = require('pdf-parse');
const sharp = require('sharp');
const os = require('os');
const generateLinkID = require("../utils/generateID")
const multer = require('multer');
// const storage = multer.memoryStorage();
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    fs.mkdir(path.join(__dirname, '../public/uploads/batchupload'),{recursive:true})
    cb(null, path.join(__dirname, '../public/uploads/batchupload'));
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});
const upload = multer({ storage });

// --- Assume Sequelize Models and DB Instance are available ---
// In a real application, you would have something like:
// const db = require('./models'); // This 'db' object would contain sequelize instance and all models
// For this example, we'll assume `db.Document`, `db.OcrField`, `db.Field` are accessible.
//
// Placeholder for the `db` object and models.
// In your actual `app.js` or main server file, ensure `db` is correctly initialized
// and passed or made globally available if this file is a separate module.
const db =require("../config/database.js"); // Adjust the path to your actual database configuration file
// IMPORTANT: Replace the placeholder `db` object above with your actual Sequelize `db` import.
// Example: const db = require('./path/to/your/models/index.js');

async function convertPDFToImage(pdf, outDir) {
 fs.mkdir(outDir, { recursive: true });

  const options = {
    format: 'png',
    out_dir: outDir,
    out_prefix: 'page',
    page: null,
  };

  await convert(pdf, options);
  //console.log('✅ PDF converted to images');
  
}



// --- Configuration ---
const config = {
    folderPaths: {
        base: process.env.BASE_FOLDER_PATH || './processed_docs',
        // Other specific paths can be defined if needed by PDF processing functions
        // mainPages: './processed_docs/main pages',
        // byDocument: './processed_docs/by document',
        // separatedDocuments: './processed_docs/separated documents',
        // mergedMainPages: './processed_docs/merged main pages',
        // separatedByBatch: './processed_docs/separated by batch',
        // separatedMainByBatch: './processed_docs/separated main by batch'
    },
    ocr: {
        licenseKey: process.env.IRONSUITE_LICENSE_KEY // If you still use IronOCR via an API, otherwise not needed for tesseract.js
    },
    logging: {
        level: process.env.LOG_LEVEL || 'info'
    }
};

// --- Logger Setup ---
const logger = winston.createLogger({
    level: config.logging.level,
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.printf(info => `${info.timestamp} ${info.level.toUpperCase()}: ${info.message}`)
    ),
    transports: [
        new winston.transports.Console(),
        // new winston.transports.File({ filename: 'error.log', level: 'error' }),
        // new winston.transports.File({ filename: 'combined.log' })
    ],
});

// --- Utility Functions ---

/**
 * Gets the current server date and time in 'YYYY-MM-DD HH:mm:ss' format.
 * @returns {string} Formatted date string.
 */
function getServerDateTime() {
    return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * Generates a unique ID based on the current date/time with milliseconds.
 * Mimics VB.NET's `Now.ToString("MMddyyyyHHmmssfff")`
 * @returns {string} Generated ID.
 */
function generateId() {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const yyyy = now.getFullYear();
    const hh = String(now.getHours()).padStart(2, '0');
    const mi = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    const fff = String(now.getMilliseconds()).padStart(3, '0');
    return `${mm}${dd}${yyyy}${hh}${mi}${ss}${fff}`;
}

/**
 * Ensures a directory exists, creating it if it doesn't.
 * @param {string} dirPath The path to the directory.
 */
async function ensureDirectoryExists(dirPath) {
    try {
        await fs.mkdir(dirPath, { recursive: true });
        logger.debug(`Ensured directory exists: ${dirPath}`);
    } catch (error) {
        logger.error(`Error creating directory ${dirPath}: ${error.message}`);
        throw error;
    }
}

// --- Excel Processing ---

/**
 * Reads data from the first sheet of an Excel file.
 * @param {string} filePath The path to the Excel file.
 * @returns {Promise<Array<object>>} An array of objects, where each object represents a row.
 */
async function readExcelData(filePath) {
    const workbook = new ExcelJS.Workbook();
    let excelDataTable = [];

    try {
        await workbook.xlsx.readFile(filePath);
        const worksheet = workbook.getWorksheet('Sheet1');

        if (!worksheet) {
            throw new Error('Sheet1 not found in the Excel file.');
        }

        const headerRow = worksheet.getRow(1);
        if (!headerRow.values) {
            throw new Error('Excel file is empty or missing header row.');
        }

        const columns = headerRow.values.map(cell => cell ? String(cell) : '').filter(Boolean);

        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return; // Skip header row

            const rowData = {};
            row.eachCell((cell, colNumber) => {
                const header = columns[colNumber - 1];
                if (header) {
                    rowData[header] = cell.value;
                }
            });
            excelDataTable.push(rowData);
        });

        logger.info(`Successfully read ${excelDataTable.length} rows from Excel file.`);
        return excelDataTable;

    } catch (error) {
        logger.error(`Error reading Excel file: ${error.message}`);
        throw error;
    }
}

// --- PDF Processing (Simplified, as tesseract.js often handles PDF directly) ---

// You can add more complex PDF splitting/merging functions here if needed,
// similar to the previous multi-file example, using `pdf-lib`.
// For direct OCR, tesseract.js is usually sufficient with a PDF path and page number.


// --- OCR Service ---

/**
 * Performs OCR on a specific region of a PDF page or image file using Tesseract.js.
 * @param {string} inputPath Path to the PDF file or image.
 * @param {number} pageIndex 0-indexed page number if input is a PDF (for tesseract.js 'page' option).
 * @param {object} rect OCR region { x, y, width, height } - Note: tesseract.js uses { left, top, width, height }
 * @param {string} fieldType The data type of the field (e.g., 'Date', 'Text') for post-processing.
 * @returns {Promise<string>} The extracted text.
 */
async function performOcr(inputPath, pageIndex, rect, fieldType,fieldname) {
    try {
        const tesseractRect = { left: rect.x, top: rect.y, width: rect.width, height: rect.height };
        //console.log("tesseractRect====?======================>",tesseractRect)

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ocr-field-'));
       const croppedImagePath = path.join(tmpDir, `${fieldname}.png`);
             const tocrop={ left: Math.round(tesseractRect.left), top: Math.round(tesseractRect.top), width: Math.round(tesseractRect.width), height: Math.round(tesseractRect.height) }
             //console.log(`Cropping ${fieldname} at`, tocrop);
             await sharp(inputPath)
               .extract(tocrop)
               .toFile(croppedImagePath);
       //console.log("croppedImagePath",croppedImagePath)
            //  const { data: { text } } = await Tesseract.recognize(croppedImagePath, 'eng');
            //  extractedData[fieldName] = text.trim();

        const { data: { text } } = await Tesseract.recognize(
            croppedImagePath,
            'eng', // English language. You might need to load other languages.
            {
                logger: m => logger.debug(`OCR Progress (${path.basename(inputPath)} page ${pageIndex + 1}): ${m.status} - ${(m.progress * 100).toFixed(2)}%`),
                page: pageIndex,
                rectangle: tesseractRect
            }
        );

        let processedText = text.trim();

        // Apply type-specific processing based on fieldType from your DB
        if (fieldType && fieldType.toLowerCase().includes('date')) {
            // Attempt to parse and format date. This is very basic and might need more robust date parsing.
            const parsedDate = new Date(processedText);
            if (!isNaN(parsedDate) && parsedDate.getFullYear() > 1900 && parsedDate.getFullYear() < 2100) { // Basic validation for year range
                processedText = parsedDate.toISOString().slice(0, 10); // YYYY-MM-DD
            } else {
                processedText = ''; // Or some default date, or signal failure
                logger.warn(`Could not parse date for field. Original: '${text}'`);
            }
        }
        // Add more type handling as needed (e.g., numbers, specific formats)
        // await fs.unlink(croppedImagePath);
        return processedText;
    } catch (error) {
        logger.error(`OCR failed for ${inputPath} (page ${pageIndex + 1}, rect ${JSON.stringify(rect)}): ${error.message}`);
        //console.log("errorr==================>>>>.",error,"<<<<<<<<<<<<<<<<<<<<<")
        return ''; // Return empty string or handle as appropriate
    }
}

// --- Express Route Handler (Controller) ---

/**
 * This function defines the Express.js GET route for batch Excel upload and OCR.
 *
 * @param {object} app The Express application instance.
 * @param {object} db The Sequelize database instance containing models (e.g., { Document, OcrField, Field, sequelize }).
 */



router.post('/processexcelsheet',upload.single('batchupload'), async (req, res) => {
    //console.log("req.file=====>",req.file)
    // fs.mkdirSync(path.join(__dirname, '../public/uploads/batchupload'),{recursive:true})
    const excelFilePath = path.join(__dirname, '../public/uploads/batchupload', req.file.filename);
    //console.log("excelFilePath",excelFilePath)
    // const excelFilePath = path.join(__dirname, 'uploads', 'BatchUpload.xlsx');

    if (!excelFilePath) {
        logger.error('Missing filePath query parameter.');
        return res.status(400).json({ error: 'Missing filePath query parameter. Usage: /process-excel?filePath=C:/path/to/your/input.xlsx' });
    }

    logger.info(`Received request to process Excel file: ${excelFilePath}`);

    try {
        let stats;
        try {
            stats = await fs.stat(excelFilePath);
            if (!stats.isFile()) {
                logger.error(`Error: '${excelFilePath}' is not a file.`);
                return res.status(400).json({ error: `'${excelFilePath}' is not a valid file.` });
            }
        } catch (err) {
            logger.error(`Error accessing file '${excelFilePath}': ${err.message}`);
            return res.status(400).json({ error: `Cannot access file '${excelFilePath}'. Ensure path is correct and permissions are granted.` });
        }

        logger.info('Reading Excel data...');
        const excelDataTable = await readExcelData(excelFilePath);
        if (!excelDataTable?.length) {
            logger.warn('No data found in the Excel file.');
            return res.status(200).json({ message: 'No data found in the Excel file. Process finished.' });
        }

        logger.info(`Loaded ${excelDataTable.length} records from Excel.`);
        const processedDocuments = [];
        let successfulUpdates = 0;
        let failedUpdates = 0;

        for (const [i, rowData] of excelDataTable.entries()) {
            const fileName = rowData['File Name'];
            // const LinkID = rowData['Link ID'];
            const linkIdFromExcel = rowData['Link ID'];
            //console.log("linkIdFromExcel",linkIdFromExcel)
            if (!fileName ) {
                logger.warn(`Skipping row ${i + 1}: Missing 'File Name' or 'Link ID'.`);
                failedUpdates++;
                continue;
            }

            let documentStatus = 'pending';

            try {
                const serverDate = getServerDateTime();
                const baseDir = path.dirname(excelFilePath);
                let pdfFilePath = ""
                
                logger.info(`Processing record ${i + 1}/${excelDataTable.length}: ${fileName}.pdf`);
                //console.log("filename",fileName)
                const existingDoc = await db.Documents.findOne({
                    where: {
                        LinkID: linkIdFromExcel,
                        Active: true
                    },
                    raw:true
                });
                //console.log("existingDoc",existingDoc)
                let pdfExists = false;
                const dir = path.join(__dirname, `../public/images/templates/document_${existingDoc.ID}`);
                // //console.log("filename",fileName,"DocId".existingDoc.ID,"linkid",linkId)
                const timestamp= new Date().getTime()
                let filePath = undefined
                try {
                    // await fs.access(pdfFilePath, fs.constants.F_OK);
                     //console.log("dir",dir)
                     const pathrelativetoserver=`document_${existingDoc.ID}`
                     await fs.mkdir(dir, { recursive: true })
                    //  await clearDirectory(dir);
                   
                     filePath = path.join(dir, `${timestamp}.pdf`);
                     filePath = filePath.trim();

                     await fs.writeFile(filePath, existingDoc.DataImage); // write image or pdf buffer to disk
                     console.log("existingDoc.DataImage",existingDoc.DataImage)
                    console.log("filePath here====>1",filePath)
                    //  let imageBuffer = doc.DataImage;
                     let fileUrl = `${timestamp}.png`;
                     const normalizedPath = path.normalize(filePath);
                     console.log("filePath here====>2",normalizedPath)
                     //console.log("normalizedPath",normalizedPath)
                     await fs.access(normalizedPath, fs.constants.F_OK);
                     console.log("filePath here====>22====>",filePath)
                     pdfFilePath=normalizedPath
                     //console.log("pdfFilePath=?",pdfFilePath)
                    pdfExists = true;
                    //console.log("file found")
                    logger.info(`PDF file found: ${filePath}`);
                } catch(err) {
                    //console.log("file not found",err)
                    logger.warn(`PDF file not found: ${filePath}. Skipping OCR.`);
                }

                

                const linkId = existingDoc ? existingDoc.LinkID : generateLinkID();
                const documentData = {
                    LinkID: linkId,
                    FileName: fileName,
                    FileDate: rowData['File Date'] ? new Date(rowData['File Date']) : new Date(serverDate),
                    Expiration: rowData['Expiration'] === true || rowData['Expiration'] === 1,
                    ExpirationDate: rowData['Expiration Date'] ? new Date(rowData['Expiration Date']) : null,
                    Confidential: rowData['Confidential'] === true || rowData['Confidential'] === 1,
                    'Page Count': rowData['Page Count'] || 0,
                    Remarks: rowData['Remarks'] || '',
                    Active: true,
                    'Created By': rowData['Created By'] || 'System',
                    'Created Date': new Date(serverDate)
                };

                for (let j = 1; j <= 10; j++) {
                    documentData[`Text${j}`] = rowData[`Text${j}`] || '';
                    documentData[`Date${j}`] = rowData[`Date${j}`] ? new Date(rowData[`Date${j}`]) : new Date(serverDate);
                }

                let document;
                if (existingDoc) {
                    await db.Documents.update(documentData, { where: { ID: existingDoc.ID } });
                    logger.info(`Updated record for ${fileName} (ID: ${existingDoc.ID})`);
                    documentStatus = 'updated';
                    document = existingDoc;
                } else {
                    document = await db.Documents.create(documentData);
                    logger.info(`Inserted new record for ${fileName}`);
                    documentStatus = 'inserted';
                }

                if (pdfExists) {
                    const templateName = rowData['Template Name'] || 'DefaultTemplate';
                    const templates = await db.Template.findAll({ where: { name: templateName } });

                    if (!templates.length) {
                        logger.warn(`No OCR fields found for Template '${templateName}'. Skipping OCR.`);
                        documentStatus += ' (OCR skipped: no fields)';
                        processedDocuments.push({ fileName, status: documentStatus, error: 'No OCR fields defined.' });
                        continue;
                    }
                    console.log("pdfFilePath11111111111111111",pdfFilePath)
                    const buffer = await fs.readFile(pdfFilePath);
                    console.log("buffer",buffer)
                    const outputDir = path.resolve(__dirname, `../public/images/templates/document_${existingDoc.ID}`);

                    // const outputDir="C:\\Users\\amroh\\dms-web-app-back-end\\Controllers\\uploads\\temp\\1749475931154output"
                    //console.log("outputDir",outputDir,"pdfFilePath==>",pdfFilePath)
                   
                    // return 
                    const pagesToOcr = [0];
                    // if(document.DataType=="pdf"){
                    //     await convertPdfBufferToImages(buffer, outputDir);
                    // }else{
                    //     const uuid=uuidv4()
                    //     const outputDirPath = path.join(outputDir, `${uuid}.png`);
                    //     fs.writeFile(outputDirPath, document.DataImage);
                    // }
                    await fs.mkdir(outputDir, { recursive: true });
                    if(existingDoc.DataType=="pdf"||existingDoc.DataType==".pdf"){
                        await convertPdfBufferToImages(buffer, outputDir);
                    }
                    else{
                        const uuid=uuidv4()
                        const outputDirPath = path.join(outputDir, `${uuid}.png`);
                        await fs.writeFile(outputDirPath, existingDoc.DataImage);
                    }

                    const files = await fs.readdir(outputDir);
                    const images = files.filter(file => file.endsWith('.png'));
                    // //console.log("images",images)
                    const ocrResults = {};
                    const ocrResultsList = [];

                    for (const pageIndex of pagesToOcr) {
                        //console.log("pageIndex",pageIndex)
                        const imagePath = path.join(outputDir, images[pageIndex]);
                        //console.log("imagePath",imagePath)
                        
                        logger.info(`Performing OCR on page ${pageIndex + 1}: ${imagePath}`);

                        const fields = templates[0].fields;
                        for (const fieldDef of fields) {
                            const fieldName = fieldDef['fieldName'];
                            const fieldType = fieldDef.FieldDetails?.['Data Type'] || 'Text';
                            const rect = { x: fieldDef.x, y: fieldDef.y, width: fieldDef.width, height: fieldDef.height };

                            const extractedText = await performOcr(imagePath, pageIndex, rect, fieldType, fieldName);

                            ocrResults[fieldName] = extractedText;
                            ocrResultsList.push({ fieldName, text: extractedText });
                            logger.debug(`OCR: Page ${pageIndex + 1}, Field '${fieldName}': '${extractedText}'`);
                        }
                        //console.log("ocrResults",ocrResultsList)
                        for (const result of ocrResultsList) {
                            // await db.OCRDocumentReadFields.create({
                            //     DocumentID: document.ID,
                            //     template_id:templates[0].ID,
                            //     LinkId: document.LinkID,
                            //     Field: result.fieldName,
                            //     Value: result.text
                            // });
                             const existing = await db.OCRDocumentReadFields.findOne({
                                      where: {
                                        LinkId: document.LinkID,
                                        Field: result.fieldName,
                                        template_id:templates[0].ID,
                                      }
                                    });
                            
                                    if (existing) {
                                      await existing.update({
                                        Value: result.text,
                                        LinkId: document.LinkID,
                                      });
                                    } else {
                                      await db.OCRDocumentReadFields.create({
                                        DocumentID: document.ID,
                                        LinkId: document.LinkID,
                                        Field: result.fieldName,
                                        Value: result.text,
                                        template_id:templates[0].ID,
                                      });
                              }
                        }
                    }

                    const updateData = {};
                    const textFields = Array.from({ length: 10 }, (_, i) => `Text${i + 1}`);
                    const dateFields = Array.from({ length: 10 }, (_, i) => `Date${i + 1}`);
                    let textIdx = 0, dateIdx = 0;

                    for (const fieldDef of templates[0].fields) {
                        const fieldName = fieldDef['fieldName'];
                        const fieldType = fieldDef.FieldDetails?.['Data Type'] || 'Text';
                        const ocrValue = ocrResults[fieldName];

                        if (fieldType.toLowerCase().includes('text') && textIdx < textFields.length) {
                            updateData[textFields[textIdx++]] = ocrValue;
                        } else if (fieldType.toLowerCase().includes('date') && dateIdx < dateFields.length) {
                            updateData[dateFields[dateIdx++]] = ocrValue ? new Date(ocrValue) : null;
                        }
                    }

                    if (Object.keys(updateData).length) {
                        await db.Documents.update(updateData, { where: { ID: document.ID } });
                        logger.info(`Updated OCR data for document ${fileName}.`);
                        documentStatus += ' (OCR data updated)';
                    } else {
                        logger.warn(`No OCR data to update for ${fileName}.`);
                        documentStatus += ' (OCR data not updated)';
                    }
                    fs.rmdir(outputDir, { recursive: true })
                } else {
                    documentStatus += ' (PDF not found)';
                }

                successfulUpdates++;
                processedDocuments.push({ fileName, status: documentStatus });
              
            } catch (err) {
                logger.error(`Failed to process document ${fileName}: ${err.message}`);
                console.log("err",err)
                processedDocuments.push({ fileName, status: `Failed: ${err.message}`, error: err.message });
                failedUpdates++;
            }
        }

        logger.info('Batch processing completed.');
        return res.status(200).json({
            message: 'Batch processing completed.',
            totalDocuments: excelDataTable.length,
            successfulUpdates,
            failedUpdates,
            processedDocuments
        });

    } catch (mainError) {
        logger.error(`Unhandled error: ${mainError.message}`);
        logger.error(mainError.stack);
        console.log(mainError)
        return res.status(500).json({ error: 'Internal server error during batch processing.', details: mainError.message });
    }
});




router.get('/process-excel-old', async (req, res) => {
        // const excelFilePath = req.query.filePath;
        const excelFilePath = path.join(__dirname, 'uploads', 'BatchUpload.xlsx');
        if (!excelFilePath) {
            logger.error('Missing filePath query parameter.');
            return res.status(400).json({ error: 'Missing filePath query parameter. Usage: /process-excel?filePath=C:/path/to/your/input.xlsx' });
        }

        logger.info(`Received request to process Excel file: ${excelFilePath}`);

        try {
            // Validate if the provided path is a file and accessible
            let stats;
            try {
                stats = await fs.stat(excelFilePath);
                if (!stats.isFile()) {
                    logger.error(`Error: '${excelFilePath}' is not a file.`);
                    return res.status(400).json({ error: `'${excelFilePath}' is not a valid file.` });
                }
            } catch (err) {
                logger.error(`Error accessing file '${excelFilePath}': ${err.message}`);
                return res.status(400).json({ error: `Cannot access file '${excelFilePath}'. Ensure path is correct and permissions are granted.` });
            }

            // --- Step 1: Read Excel Data ---
            logger.info('Reading Excel data...');
            const excelDataTable = await readExcelData(excelFilePath);
            if (!excelDataTable || excelDataTable.length === 0) {
                logger.warn('No data found in the Excel file.');
                return res.status(200).json({ message: 'No data found in the Excel file. Process finished.' });
            }
            logger.info(`Loaded ${excelDataTable.length} records from Excel.`);

            const processedDocuments = [];
            let successfulUpdates = 0;
            let failedUpdates = 0;

            // --- Step 2: Process Each Record (Database & PDF) ---
            for (let i = 0; i < excelDataTable.length; i++) {
                const rowData = excelDataTable[i];
                const fileName = rowData['File Name'];
                const linkId = rowData['Link ID']; // Assuming 'Link ID' is a column in your Excel
                // //console.log("fileName 1",fileName,"linkId",linkId)
                if (!fileName || !linkId) {
                    logger.warn(`Skipping row ${i + 1}: Missing 'File Name' or 'Link ID' in Excel data.`);
                    failedUpdates++;
                    continue;
                }

                let documentStatus = 'pending'; // For tracking status of each document in response
                // //console.log("he1re ")
                try {
                    // let strId = generateId(); // Generate a unique ID for the document
                    const serverDate = getServerDateTime(); // Get current server date/time

                    // Construct full path to PDF file, assuming it's in the same directory as the Excel file
                    const baseDir = path.dirname(excelFilePath);
                    const pdfFilePath = path.join(baseDir, `${fileName}.pdf`);
                    // //console.log("here2");
                    logger.info(`Processing record ${i + 1}/${excelDataTable.length}: ${fileName}.pdf`);
                    // //console.log("here3");
                    // Check if PDF file exists
                    let pdfExists = false;
                    try {
                        await fs.access(pdfFilePath, fs.constants.F_OK);
                        pdfExists = true;
                        logger.info(`PDF file found: ${pdfFilePath}`);
                        // //console.log("he1re 4")
                    } catch (error) {
                        // //console.log("he1re 5")
                        logger.warn(`PDF file not found: ${pdfFilePath}. Skipping OCR for this record.`);
                        pdfExists = false;
                    }

                    // --- Database Update/Insert using Sequelize ---
                    // Find existing document by Link ID and File Name
                    // //console.log("he1re 6")
                    const existingDoc = await db.Documents.findOne({
                        where: {
                            // 'LinkID': parseInt(linkId),
                            'FileName': fileName,
                            Active: true
                        }
                    });
                    const linkId=existingDoc ? existingDoc.LinkID : generateLinkID(); // Generate new Link ID if not found
                    // //console.log("he1re 7","existingDoc",existingDoc)
                    // Prepare data for Document model
                    const documentData = {
                        // ID: existingDoc ? existingDoc?.ID : strId, // Use existing ID or new one
                        'LinkID': linkId,
                        'FileName': fileName,
                        'FileDate': rowData['File Date'] ? new Date(rowData['File Date']) : new Date(serverDate),
                        Text1: rowData['Text1'] ? String(rowData['Text1']) : '',
                        Date1: rowData['Date1'] ? new Date(rowData['Date1']) : new Date(serverDate),
                        Text2: rowData['Text2'] ? String(rowData['Text2']) : '',
                        Date2: rowData['Date2'] ? new Date(rowData['Date2']) : new Date(serverDate),
                        Text3: rowData['Text3'] ? String(rowData['Text3']) : '',
                        Date3: rowData['Date3'] ? new Date(rowData['Date3']) : new Date(serverDate),
                        Text4: rowData['Text4'] ? String(rowData['Text4']) : '',
                        Date4: rowData['Date4'] ? new Date(rowData['Date4']) : new Date(serverDate),
                        Text5: rowData['Text5'] ? String(rowData['Text5']) : '',
                        Date5: rowData['Date5'] ? new Date(rowData['Date5']) : new Date(serverDate),
                        Text6: rowData['Text6'] ? String(rowData['Text6']) : '',
                        Date6: rowData['Date6'] ? new Date(rowData['Date6']) : new Date(serverDate),
                        Text7: rowData['Text7'] ? String(rowData['Text7']) : '',
                        Date7: rowData['Date7'] ? new Date(rowData['Date7']) : new Date(serverDate),
                        Text8: rowData['Text8'] ? String(rowData['Text8']) : '',
                        Date8: rowData['Date8'] ? new Date(rowData['Date8']) : new Date(serverDate),
                        Text9: rowData['Text9'] ? String(rowData['Text9']) : '',
                        Date9: rowData['Date9'] ? new Date(rowData['Date9']) : new Date(serverDate),
                        Text10: rowData['Text10'] ? String(rowData['Text10']) : '',
                        Date10: rowData['Date10'] ? new Date(rowData['Date10']) : new Date(serverDate),
                        Expiration: rowData['Expiration'] === true || rowData['Expiration'] === 1,
                        'ExpirationDate': rowData['Expiration Date'] ? new Date(rowData['Expiration Date']) : null,
                        Confidential: rowData['Confidential'] === true || rowData['Confidential'] === 1,
                        'Page Count': rowData['Page Count'] || 0,
                        Remarks: rowData['Remarks'] ? String(rowData['Remarks']) : '',
                        Active: true,
                        'Created By': rowData['Created By'] ? String(rowData['Created By']) : 'System',
                        'Created Date': new Date(serverDate)
                    };
                    // //console.log("docm",documentData)
                    const DocType=rowData['Type'] ? String(rowData['Type']) : 'pdf';
                    let document;
                    if (existingDoc) {
                         await db.Documents.update(documentData, {
                            where: { ID: existingDoc.ID }
                        });
                        logger.info(`Database updated record for ${fileName} (ID: ${existingDoc.ID})`);
                        documentStatus = 'updated';
                        document = existingDoc; // Use the existing document instance
                    } else {
                         document=await db.Documents.create(documentData);
                        logger.info(`Database inserted new record for ${fileName} (ID: ${strId})`);
                        documentStatus = 'inserted';
                    }

                    // --- Step 3: PDF Processing and OCR (if PDF exists) ---
                    if (pdfExists) {
                        const templateName = rowData['Template Name'] ? String(rowData['Template Name']) : 'DefaultTemplate';

                        // Fetch OCR field definitions using Sequelize Models
                        // This assumes a relationship or manual join logic if not directly related
                        const ocrFieldDefinitions = await db.Template.findAll({
                            where: {
                                // 'Link ID': linkId,
                                'name': templateName
                            },
                            // include: [{
                            //     model: db.fields, // Assuming OcrField has a relationship to Field model
                            //     as: 'FieldDetails', // Alias for the association
                            //     where: {
                            //         'Link ID': linkId,
                            //         Active: true,
                            //         Description: db.Sequelize.col('OcrField.Field Name') // Join condition
                            //     },
                            //     attributes: ['Data Type'] // Only fetch Data Type from Field
                            // }]
                        });


                        // If no direct include is possible or preferred, you might do:
                        // const rawOcrFields = await db.OcrField.findAll({ where: { 'Link ID': linkId, 'Template Name': templateName } });
                        // const fieldDescriptions = rawOcrFields.map(f => f['Field Name']);
                        // const fieldDetails = await db.Field.findAll({ where: { 'Link ID': linkId, Active: true, Description: fieldDescriptions } });
                        // Then combine `rawOcrFields` and `fieldDetails` to get `ocrFieldDefinitions`
                        // //console.log("ocrFieldDefinitions",ocrFieldDefinitions[0]['fields'])
                        if (ocrFieldDefinitions.length === 0) {
                            logger.warn(`No OCR field definitions found for Link ID ${linkId} and Template Name '${templateName}'. Skipping OCR for this document.`);
                            documentStatus += ' (OCR skipped: no fields)';
                            processedDocuments.push({ fileName, status: documentStatus, error: 'No OCR fields defined.' });
                            continue;
                        }

                        const ocrResults = {}; // To store extracted OCR data for this document
                        const ocrResults1=[]
                        // For simplicity, OCR the first page (index 0) only. Adjust `pagesToOcr` as needed.
                        // //console.log("file path===>",pdfFilePath)
                        const buffer =await fs.readFile(pdfFilePath);
                        // //console.log("buffer",buffer)
                        let numofpages=0
                        pdf(buffer).then(data => {
                        // //console.log("Number of pages:", data.numpages);
                        numofpages=data.numpages
                        });
                        const twelvedigitpath=Math.floor(Date.now() / 1000).toString().padStart(12, '0');
                        const outputDir = path.resolve(__dirname,  "uploads/temp/"+twelvedigitpath+ 'output');
                        const pagesToOcr = [90];
                    
                        await convertPDFToImage(pdfFilePath, outputDir);
                        const files = await fs.readdir(outputDir);
                        const images = files.filter(file => file.endsWith('.png'));
                        
                        // //console.log("images",images)
                        for (const pageIndex of pagesToOcr) {
                            const imagePath = path.join(outputDir, images[pageIndex]);
                            logger.info(`Performing OCR on page ${pageIndex + 1} of ${fileName}.pdf (${imagePath})`);
                            const fields=ocrFieldDefinitions[0].fields
                            for (const fieldDef of fields) {
                                // Access properties from Sequelize model instances
                                const fieldName = fieldDef['fieldName'];
                                const fieldType = fieldDef.FieldDetails ? fieldDef.FieldDetails['Data Type'] : 'Text'; // Get Data Type from joined Field model
                                const rect = {
                                    x: fieldDef.x,
                                    y: fieldDef.y,
                                    width: fieldDef.width,
                                    height: fieldDef.height
                                };

                                const extractedText = await performOcr(imagePath, pageIndex, rect, fieldType,fieldName);
                                // const extractedText = {}
                                //console.log("extracteddata",extractedText)
                                if (!ocrResults[fieldName]) {
                                    ocrResults[fieldName] = extractedText;
                                }
                                const newprocess={
                                fieldName: fieldDef.fieldName,
                                text: extractedText
                                }
                                ocrResults1.push(newprocess);
                                logger.debug(`OCR: Page ${pageIndex + 1}, Field '${fieldName}': '${extractedText}'`);
                            }
                            //console.log("ocrResults",ocrResults)

                            for (let i = 0; i < ocrResults1.length; i++) {
                                await db.OCRDocumentReadFields.create({
                                    DocumentID: document.ID,
                                    LinkId: document.LinkID,
                                    Field: ocrResults1[i].fieldName,
                                    Value: ocrResults1[i].text
                                });
                            }
                        }

                        // Update database with OCR results using Sequelize
                        const updateData = {};
                        // Map OCR results back to Document model fields
                        const textFields = ['Text1', 'Text2', 'Text3', 'Text4', 'Text5', 'Text6', 'Text7', 'Text8', 'Text9', 'Text10'];
                        const dateFields = ['Date1', 'Date2', 'Date3', 'Date4', 'Date5', 'Date6', 'Date7', 'Date8', 'Date9', 'Date10'];

                        // This mapping assumes a direct correspondence or a convention.
                        // You might need a more explicit mapping (e.g., a lookup table in your DB
                        // that maps 'OCR Field Name' to 'Document Table Column Name').
                        let textIdx = 0;
                        let dateIdx = 0;
                        // //console.log("ocrFieldDefinitions",ocrFieldDefinitions)
                        for (const fieldDef of ocrFieldDefinitions[0].fields) {
                            const fieldName = fieldDef['fieldName'];
                            //console.log("fieldName",fieldDef)
                            const fieldType = fieldDef.FieldDetails ? fieldDef.FieldDetails['Data Type'] : 'Text';
                            const ocrValue = ocrResults[fieldName];

                            if (fieldType.toLowerCase().includes('text') && textIdx < textFields.length) {
                                updateData[textFields[textIdx]] = ocrValue;
                                textIdx++;
                            } else if (fieldType.toLowerCase().includes('date') && dateIdx < dateFields.length) {
                                updateData[dateFields[dateIdx]] = ocrValue ? new Date(ocrValue) : null;
                                dateIdx++;
                            }
                        }
                        // //console.log("updateData",updateData)
                        if (Object.keys(updateData).length > 0) {
                            await db.Documents.update(updateData, {
                                where: { ID: document.ID } // Use the ID determined earlier
                            });
                            logger.info(`Successfully updated document ${fileName} with OCR data.`);
                            documentStatus += ' (OCR data updated)';
                        } else {
                            logger.warn(`No OCR data to update for document ${fileName}.`);
                            documentStatus += ' (OCR data not updated)';
                        }
                    } else {
                        documentStatus += ' (PDF not found)';
                    }
                    successfulUpdates++;
                    processedDocuments.push({ fileName, status: documentStatus });

                } catch (docProcessError) {
                    //console.log("docprocesserror",docProcessError)
                    logger.error(`Failed to process document ${fileName}: ${docProcessError.message}`);
                    documentStatus += ` (Failed: ${docProcessError.message})`;
                    failedUpdates++;
                    processedDocuments.push({ fileName, status: documentStatus, error: docProcessError.message });
                }
            }

            logger.info('Batch processing completed.');
            return res.status(200).json({
                message: 'Batch processing initiated successfully.',
                totalDocuments: excelDataTable.length,
                successfulUpdates: successfulUpdates,
                failedUpdates: failedUpdates,
                processedDocuments: processedDocuments // List of each document's status
            });

        } catch (mainError) {
            logger.error(`An unhandled error occurred during batch processing: ${mainError.message}`);
            logger.error(mainError.stack);
            return res.status(500).json({ error: 'Internal server error during batch processing.', details: mainError.message });
        }
    });




module.exports = router;