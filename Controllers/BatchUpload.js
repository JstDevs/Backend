// This file contains the Express.js route handler for batch Excel upload and OCR processing.
// It assumes Sequelize is already configured and its models are available.

// --- Required Imports ---
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs').promises; // Using promises-based fs for async operations
const fsSync = require('fs'); // Using synchronous fs for callbacks
const ExcelJS = require('exceljs'); // Excel file reading/writing
const Tesseract = require('tesseract.js'); // OCR engine wrapper
const { PDFDocument } = require('pdf-lib'); // PDF manipulation (splitting, merging)
const winston = require('winston'); // Logging library
const AdmZip = require('adm-zip'); // ZIP file extraction
require('dotenv').config();        // Load environment variables from .env
// const { convert } = require('pdf-poppler');
const convertPdfBufferToImages=require("../utils/pdftoimages_1")
const pdf = require('pdf-parse');
const sharp = require('sharp');
const os = require('os');
const generateLinkID = require("../utils/generateID")
const { calculatePageCount } = require('../utils/calculatePageCount');
const multer = require('multer');
// const storage = multer.memoryStorage();
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    fsSync.mkdirSync(path.join(__dirname, '../public/uploads/batchupload'), { recursive: true });
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
 await fs.mkdir(outDir, { recursive: true });

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
 * Reads data from the first sheet of an Excel file or CSV file.
 * @param {string} filePath The path to the Excel/CSV file.
 * @returns {Promise<Array<object>>} An array of objects, where each object represents a row.
 */
async function readExcelData(filePath) {
     const workbook = new ExcelJS.Workbook();
     let excelDataTable = [];
     const fileExt = path.extname(filePath).toLowerCase();
     const isCsv = fileExt === '.csv';
 
     try {
         // Read file based on extension
         if (isCsv) {
             logger.info(`Reading CSV file: ${filePath}`);
             await workbook.csv.readFile(filePath);
         } else {
             logger.info(`Reading Excel file: ${filePath}`);
             await workbook.xlsx.readFile(filePath);
         }
         
         let worksheet = workbook.getWorksheet('Sheet1');
         if (!worksheet) {
             worksheet = workbook.worksheets?.[0];
         }
         if (!worksheet) {
             throw new Error(`No worksheet found in the ${isCsv ? 'CSV' : 'Excel'} file.`);
         }

         const headerRow = worksheet.getRow(1);
         if (!headerRow || headerRow.cellCount === 0) {
             throw new Error(`${isCsv ? 'CSV' : 'Excel'} file is empty or missing header row.`);
         }

         const columnCount = worksheet.actualColumnCount || headerRow.cellCount;
         const headers = [];
         for (let c = 1; c <= columnCount; c++) {
             const cellVal = headerRow.getCell(c).value;
             headers[c] = (cellVal !== null && cellVal !== undefined) ? String(cellVal).trim() : '';
         }

         worksheet.eachRow((row, rowNumber) => {
             if (rowNumber === 1) return; // Skip header row
             const rowData = {};
             for (let c = 1; c <= columnCount; c++) {
                 const header = headers[c];
                 if (!header) continue;
                 const cellValue = row.getCell(c).value;
                 // Handle different value types
                 rowData[header] = (cellValue !== null && cellValue !== undefined) ? cellValue : '';
             }
             // Only push non-empty rows
             if (Object.keys(rowData).length > 0) {
                 excelDataTable.push(rowData);
             }
         });
 
         logger.info(`Successfully read ${excelDataTable.length} rows from ${isCsv ? 'CSV' : 'Excel'} file.`);
         return excelDataTable;
 
     } catch (error) {
         logger.error(`Error reading ${isCsv ? 'CSV' : 'Excel'} file: ${error.message}`);
         logger.error(`File path: ${filePath}, Error stack: ${error.stack}`);
         throw new Error(`Failed to read ${isCsv ? 'CSV' : 'Excel'} file: ${error.message}`);
    }
}

// --- ZIP Processing Functions ---

/**
 * Extracts a ZIP file to a temporary directory
 * @param {string} zipPath Path to the ZIP file
 * @param {string} extractDir Directory to extract to
 * @returns {Promise<void>}
 */
async function extractZipFile(zipPath, extractDir) {
    try {
        // Verify file exists
        try {
            const stats = await fs.stat(zipPath);
            if (!stats.isFile()) {
                throw new Error(`Path is not a file: ${zipPath}`);
            }
            if (stats.size === 0) {
                throw new Error(`ZIP file is empty: ${zipPath}`);
            }
            logger.info(`ZIP file verified: ${zipPath} (${stats.size} bytes)`);
        } catch (statError) {
            throw new Error(`Cannot access ZIP file: ${statError.message}`);
        }

        // Create extraction directory
        await fs.mkdir(extractDir, { recursive: true });
        
        // Read and validate ZIP file with retry mechanism
        let zipBuffer;
        let retries = 3;
        let readError = null;
        
        while (retries > 0) {
            try {
                zipBuffer = await fs.readFile(zipPath);
                readError = null;
                break;
            } catch (err) {
                readError = err;
                retries--;
                if (retries > 0) {
                    logger.warn(`Failed to read ZIP file, retrying... (${retries} attempts left)`);
                    await new Promise(resolve => setTimeout(resolve, 100)); // Wait 100ms before retry
                }
            }
        }
        
        if (readError) {
            throw new Error(`Cannot read ZIP file after retries: ${readError.message}`);
        }

        // Validate ZIP file signature (first 4 bytes should be PK\x03\x04 or PK\x05\x06 or PK\x07\x08)
        const signature = zipBuffer.slice(0, 4);
        const isValidZipStart = signature[0] === 0x50 && signature[1] === 0x4B && 
                          (signature[2] === 0x03 || signature[2] === 0x05 || signature[2] === 0x07);
        
        if (!isValidZipStart) {
            throw new Error('Invalid ZIP file format. File does not appear to be a valid ZIP archive. Please ensure the file is a properly formatted ZIP file.');
        }

        // Validate ZIP file end (last bytes should contain end of central directory signature PK\x05\x06)
        // The end of central directory record is typically in the last 65557 bytes
        const endSignature = zipBuffer.slice(-22); // Last 22 bytes should contain the end of central directory
        const hasValidEnd = endSignature.includes(0x50) && endSignature.includes(0x4B) && 
                           (endSignature.includes(0x05) || endSignature.includes(0x06));
        
        if (!hasValidEnd && zipBuffer.length > 22) {
            // Check a larger range at the end
            const largerEnd = zipBuffer.slice(-65557);
            const hasValidEndLarge = largerEnd.includes(Buffer.from([0x50, 0x4B, 0x05, 0x06]));
            
            if (!hasValidEndLarge) {
                logger.warn('ZIP file end signature validation failed, but proceeding with extraction attempt');
            }
        }
        
        logger.info(`ZIP file buffer read successfully: ${zipBuffer.length} bytes`);

        // Extract ZIP - try multiple methods
        let zip;
        let extractionMethod = 'unknown';
        
        // Method 1: Try with file path (AdmZip handles file paths well)
        try {
            logger.info(`Attempting ZIP extraction using file path method...`);
            zip = new AdmZip(zipPath);
            extractionMethod = 'file-path';
            logger.info(`ZIP initialized successfully using file path method`);
        } catch (zipPathError) {
            logger.warn(`File path method failed: ${zipPathError.message}, trying buffer method...`);
            
            // Method 2: Try with buffer
            try {
                zip = new AdmZip(zipBuffer);
                extractionMethod = 'buffer';
                logger.info(`ZIP initialized successfully using buffer method`);
            } catch (zipBufferError) {
                logger.error(`Buffer method also failed: ${zipBufferError.message}`);
                
                // Method 3: Try reading file again and using buffer
                try {
                    logger.info(`Retrying with fresh file read...`);
                    const freshBuffer = await fs.readFile(zipPath);
                    zip = new AdmZip(freshBuffer);
                    extractionMethod = 'fresh-buffer';
                    logger.info(`ZIP initialized successfully using fresh buffer`);
                } catch (freshBufferError) {
                    const errorMsg = `All ZIP extraction methods failed. File may be corrupted, incomplete, or not a valid ZIP archive. ` +
                                   `File path error: ${zipPathError.message}. ` +
                                   `Buffer error: ${zipBufferError.message}. ` +
                                   `Fresh buffer error: ${freshBufferError.message}. ` +
                                   `File size: ${zipBuffer.length} bytes.`;
                    logger.error(errorMsg);
                    throw new Error(errorMsg);
                }
            }
        }
        
        try {
            logger.info(`Extracting ZIP contents using ${extractionMethod} method...`);
            zip.extractAllTo(extractDir, true); // Overwrite existing files
            logger.info(`ZIP file extracted successfully to: ${extractDir}`);
        } catch (extractError) {
            const errorMsg = `Failed to extract ZIP contents using ${extractionMethod} method: ${extractError.message}. ` +
                           `The ZIP file may be corrupted, password-protected, or contain invalid entries.`;
            logger.error(errorMsg);
            throw new Error(errorMsg);
        }
    } catch (error) {
        logger.error(`Error extracting ZIP file: ${error.message}`);
        logger.error(`ZIP path: ${zipPath}, Stack: ${error.stack}`);
        throw new Error(`Failed to extract ZIP file: ${error.message}`);
    }
}

/**
 * Finds Excel file in extracted directory (recursive search)
 * @param {string} dir Directory to search
 * @returns {Promise<string|null>} Path to Excel file or null if not found
 */
async function findExcelInDirectory(dir) {
    const excelExtensions = ['.xlsx', '.xls', '.csv'];
    const files = await fs.readdir(dir, { withFileTypes: true });
    
    for (const file of files) {
        const fullPath = path.join(dir, file.name);
        
        if (file.isDirectory()) {
            // Recursive search in subdirectories
            const found = await findExcelInDirectory(fullPath);
            if (found) return found;
        } else {
            const ext = path.extname(file.name).toLowerCase();
            if (excelExtensions.includes(ext)) {
                logger.info(`Found Excel file: ${fullPath}`);
                return fullPath;
            }
        }
    }
    
    return null;
}

/**
 * Builds a map of all files in extracted directory for case-insensitive matching
 * @param {string} dir Directory to scan
 * @returns {Promise<Map<string, string>>} Map of lowercase filename -> full path
 */
async function buildFileMap(dir) {
    const fileMap = new Map();
    
    async function scanDirectory(currentDir) {
        const entries = await fs.readdir(currentDir, { withFileTypes: true });
        
        for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);
            
            if (entry.isDirectory()) {
                await scanDirectory(fullPath);
            } else {
                // Store with lowercase key for case-insensitive matching
                const lowerName = entry.name.toLowerCase();
                const nameWithoutExt = path.parse(entry.name).name.toLowerCase();
                
                // Store by full name
                fileMap.set(lowerName, fullPath);
                // Also store by name without extension
                fileMap.set(nameWithoutExt, fullPath);
            }
        }
    }
    
    await scanDirectory(dir);
    logger.info(`Built file map with ${fileMap.size} entries`);
    return fileMap;
}

/**
 * Matches a filename from Excel row to a file in the extracted ZIP
 * @param {string} fileName File name from Excel row
 * @param {Map<string, string>} fileMap Map of files from ZIP
 * @returns {string|null} Path to matched file or null
 */
function matchFileToRow(fileName, fileMap) {
    if (!fileName) return null;
    
    // Try exact match (case-insensitive)
    const lowerName = fileName.toLowerCase();
    if (fileMap.has(lowerName)) {
        return fileMap.get(lowerName);
    }
    
    // Try with common extensions if not present
    const extensions = ['.pdf', '.png', '.jpg', '.jpeg', '.doc', '.docx', '.txt'];
    for (const ext of extensions) {
        const withExt = lowerName + ext;
        if (fileMap.has(withExt)) {
            return fileMap.get(withExt);
        }
    }
    
    // Try name without extension (in case Excel has extension but file doesn't)
    const nameWithoutExt = path.parse(fileName).name.toLowerCase();
    if (fileMap.has(nameWithoutExt)) {
        return fileMap.get(nameWithoutExt);
    }
    
    // Try partial match (e.g., "SampleDoc" matches "SampleDoc.pdf")
    for (const [key, filePath] of fileMap.entries()) {
        if (key.includes(nameWithoutExt) || nameWithoutExt.includes(key)) {
            return filePath;
        }
    }
    
    return null;
}

/**
 * Reads file and detects its type
 * @param {string} filePath Path to file
 * @returns {Promise<{buffer: Buffer, type: string}>}
 */
async function readFileWithType(filePath) {
    const buffer = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase().replace('.', '');
    
    // Map extensions to types
    const typeMap = {
        'pdf': 'pdf',
        'png': 'png',
        'jpg': 'jpg',
        'jpeg': 'jpeg',
        'doc': 'doc',
        'docx': 'docx',
        'txt': 'txt'
    };
    
    const type = typeMap[ext] || ext || 'unknown';
    return { buffer, type };
}

/**
 * Cleans up temporary directory
 * @param {string} dir Directory to remove
 */
async function cleanupTempDirectory(dir) {
    try {
        await fs.rm(dir, { recursive: true, force: true });
        logger.info(`Cleaned up temp directory: ${dir}`);
    } catch (error) {
        logger.warn(`Failed to cleanup temp directory ${dir}: ${error.message}`);
    }
}

// --- PDF Processing (Simplified, as tesseract.js often handles PDF directly) ---

// You can add more complex PDF splitting/merging functions here if needed,
// similar to the previous multi-file example, using `pdf-lib`.
// For direct OCR, tesseract.js is usually sufficient with a PDF path and page number.

// --- Audit Trail Helper ---
const logAuditTrail = async (documentId, action, actionBy, oldValues = null, newValues = null, req = null, LinkID) => {
    try {
        await db.DocumentAuditTrail.create({
            DocumentID: documentId,
            Action: action,
            ActionBy: actionBy,
            ActionDate: new Date(),
            OldValues: oldValues,
            NewValues: newValues,
            IPAddress: req?.ip,
            UserAgent: req?.get('User-Agent'),
            SessionID: req?.sessionID,
            LinkID: LinkID
        });
    } catch (error) {
        logger.error(`Failed to log audit trail for document ${documentId}: ${error.message}`);
        // Don't throw - audit trail failure shouldn't break batch processing
    }
};

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
    if (!req.file) {
        logger.error('No file uploaded. Expected field name "batchupload"');
        return res.status(400).json({ error: 'No file uploaded. Please send a file in form-data under field name "batchupload".' });
    }
    // Validate required department context (frontend should send dep/subdep)
    const depNumInit = Number(req.body?.dep);
    const subdepNumInit = Number(req.body?.subdep);
    if (!Number.isFinite(depNumInit) || !Number.isFinite(subdepNumInit)) {
        logger.error('Missing required department fields: dep or subdep not provided');
        return res.status(400).json({ error: 'Missing required fields: dep and subdep are required for batch upload.' });
    }
    
    const uploadedFilePath = path.join(__dirname, '../public/uploads/batchupload', req.file.filename);
    const uploadedFileExt = path.extname(req.file.originalname).toLowerCase();
    const isZipFile = req.body?.isZip === 'true' || 
                      uploadedFileExt === '.zip' || 
                      req.file.mimetype === 'application/zip' || 
                      req.file.mimetype === 'application/x-zip-compressed';
    
    let excelFilePath;
    let extractedZipDir = null;
    let fileMap = null;

    // Handle ZIP file extraction
    if (isZipFile) {
        logger.info(`ZIP file detected: ${req.file.originalname}`);
        logger.info(`Uploaded file path: ${uploadedFilePath}`);
        logger.info(`File size from multer: ${req.file.size} bytes`);
        
        try {
            // Small delay to ensure file is fully written to disk
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Verify uploaded file exists and is accessible with retry
            let fileStats;
            let statRetries = 3;
            while (statRetries > 0) {
                try {
                    fileStats = await fs.stat(uploadedFilePath);
                    if (fileStats.isFile() && fileStats.size > 0) {
                        break;
                    }
                } catch (statErr) {
                    statRetries--;
                    if (statRetries === 0) {
                        logger.error(`Cannot access uploaded file after retries: ${statErr.message}`);
                        return res.status(400).json({ 
                            error: `Uploaded file not accessible: ${statErr.message}` 
                        });
                    }
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }
            
            logger.info(`File verified: ${fileStats.size} bytes, isFile: ${fileStats.isFile()}`);
            
            // Verify file size matches what multer reported
            if (req.file.size && fileStats.size !== req.file.size) {
                logger.warn(`File size mismatch: multer reported ${req.file.size} bytes, disk has ${fileStats.size} bytes`);
                // Wait a bit more and re-check
                await new Promise(resolve => setTimeout(resolve, 200));
                const recheckStats = await fs.stat(uploadedFilePath);
                if (recheckStats.size !== req.file.size) {
                    logger.error(`File size still mismatched after wait: multer=${req.file.size}, disk=${recheckStats.size}`);
                    return res.status(400).json({ 
                        error: `File upload incomplete. Expected ${req.file.size} bytes but got ${recheckStats.size} bytes. Please try uploading again.` 
                    });
                }
            }

            // Create temp directory for extraction
            const timestamp = Date.now();
            extractedZipDir = path.join(__dirname, '../temp', `zip_extract_${timestamp}_${uuidv4()}`);
            logger.info(`Extraction directory: ${extractedZipDir}`);
            
            // Extract ZIP
            logger.info(`Starting ZIP extraction from: ${uploadedFilePath}`);
            await extractZipFile(uploadedFilePath, extractedZipDir);
            logger.info(`ZIP extraction completed successfully`);
            
            // Find Excel file in extracted directory
            logger.info(`Searching for Excel file in extracted directory...`);
            excelFilePath = await findExcelInDirectory(extractedZipDir);
            
            if (!excelFilePath) {
                logger.warn(`No Excel file found in extracted ZIP archive`);
                await cleanupTempDirectory(extractedZipDir);
                return res.status(400).json({ 
                    error: 'No Excel file (.xlsx, .xls, or .csv) found in ZIP archive.' 
                });
            }
            
            logger.info(`Excel file found: ${excelFilePath}`);
            
            // Build file map for matching
            logger.info(`Building file map for ZIP contents...`);
            fileMap = await buildFileMap(extractedZipDir);
            logger.info(`ZIP extracted successfully. Excel found: ${excelFilePath}, ${fileMap.size} files mapped`);
            
        } catch (zipError) {
            logger.error(`ZIP extraction/processing failed: ${zipError.message}`);
            logger.error(`Error type: ${zipError.constructor.name}`);
            logger.error(`Stack trace: ${zipError.stack}`);
            console.error('ZIP Error Details:', {
                message: zipError.message,
                name: zipError.name,
                stack: zipError.stack,
                uploadedFilePath,
                extractedZipDir
            });
            
            if (extractedZipDir) {
                try {
                    await cleanupTempDirectory(extractedZipDir);
                } catch (cleanupErr) {
                    logger.warn(`Failed to cleanup temp directory: ${cleanupErr.message}`);
                }
            }
            
            // Return 400 for client errors (bad ZIP file), 500 for server errors
            const isClientError = zipError.message.includes('Invalid') || 
                                 zipError.message.includes('corrupted') || 
                                 zipError.message.includes('incomplete') ||
                                 zipError.message.includes('end of central directory');
            
            return res.status(isClientError ? 400 : 500).json({ 
                error: `Failed to process ZIP file: ${zipError.message}`,
                details: zipError.message,
                errorType: zipError.constructor.name
            });
        }
    } else {
        // Regular Excel file
        excelFilePath = uploadedFilePath;
    }

    if (!excelFilePath) {
        logger.error('Missing filePath query parameter.');
        return res.status(400).json({ error: 'Missing filePath query parameter. Usage: /process-excel?filePath=C:/path/to/your/input.xlsx' });
    }

    logger.info(`Received request to process ${isZipFile ? 'ZIP with' : ''} Excel file: ${excelFilePath}`);

    try {
        let stats;
        try {
            stats = await fs.stat(excelFilePath);
            if (!stats.isFile()) {
                logger.error(`Error: '${excelFilePath}' is not a file.`);
                if (extractedZipDir) await cleanupTempDirectory(extractedZipDir);
                return res.status(400).json({ error: `'${excelFilePath}' is not a valid file.` });
            }
        } catch (err) {
            logger.error(`Error accessing file '${excelFilePath}': ${err.message}`);
            if (extractedZipDir) await cleanupTempDirectory(extractedZipDir);
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
            const get = (obj, ...keys) => {
                for (const k of keys) {
                    if (obj[k] !== undefined) return obj[k];
                }
                return undefined;
            };

            const fileName = get(rowData, 'File Name', 'FileName', 'filename', 'FILE NAME');
            const linkIdFromExcel = get(rowData, 'Link ID', 'LinkID', 'linkid', 'LINK ID');
            if (!fileName) {
                logger.warn(`Skipping row ${i + 1}: Missing 'File Name'.`);
                failedUpdates++;
                processedDocuments.push({ fileName: '(missing)', status: 'Failed', error: "Missing 'File Name'." });
                continue;
            }

            let documentStatus = 'pending';
            let fileMatched = false; // Track if file was matched from ZIP

            try {
                const serverDate = getServerDateTime();
                const baseDir = path.dirname(excelFilePath);
                let pdfFilePath = ""
                
                logger.info(`Processing record ${i + 1}/${excelDataTable.length}: ${fileName}.pdf`);
                //console.log("filename",fileName)
                // Lookup only if Link ID provided
                let existingDoc = null;
                if (linkIdFromExcel) {
                    existingDoc = await db.Documents.findOne({
                        where: { LinkID: linkIdFromExcel, Active: true },
                        raw: true
                    });
                }

                // Defer file handling until after upsert
                let pdfExists = false;
                let filePath = undefined
                const timestamp= Date.now()


                const normalizeDate = (v) => (v ? new Date(v) : null);
                const truthy = (v) => v === true || v === 1 || String(v).toLowerCase() === 'true';
                const get = (obj, ...keys) => {
                    for (const k of keys) {
                        if (obj[k] !== undefined) return obj[k];
                    }
                    return undefined;
                };

                const linkId = existingDoc ? existingDoc.LinkID : generateLinkID();

                // Helper to determine Active status - default to true (1) unless explicitly set to false/0
                const getActiveStatus = (value) => {
                    if (value === undefined || value === null || value === '') {
                        return true; // Default to active
                    }
                    return truthy(value);
                };

                // Helper to determine publishing_status - default to true (1) unless explicitly set to false/0
                const getPublishingStatus = (value) => {
                    if (value === undefined || value === null || value === '') {
                        return true; // Default to published
                    }
                    return truthy(value);
                };

                const documentData = {
                    LinkID: linkId,
                    FileName: fileName,
                    FileDate: normalizeDate(rowData['File Date']) || new Date(serverDate),
                    Expiration: truthy(rowData['Expiration']),
                    ExpirationDate: normalizeDate(rowData['Expiration Date']),
                    Confidential: truthy(rowData['Confidential']),
                    FileDescription: get(rowData, 'File Description', 'FileDescription') || '',
                    Description: get(rowData, 'Description') || '',
                    publishing_status: getPublishingStatus(get(rowData, 'publishing_status', 'Publishing Status')), 
                    Active: getActiveStatus(rowData['Active']),
                    Remarks: rowData['Remarks'] || '',
                    Createdby: rowData['Created By'] || 'System',
                    CreatedDate: new Date(serverDate),
                    DepartmentId: Number(req.body.dep) || null,
                    SubDepartmentId: Number(req.body.subdep) || null,
                };

                for (let j = 1; j <= 10; j++) {
                    documentData[`Text${j}`] = rowData[`Text${j}`] || '';
                    documentData[`Date${j}`] = normalizeDate(rowData[`Date${j}`]);
                }

                let document;
                try {
                    if (existingDoc) {
                        await db.Documents.update(documentData, { where: { ID: existingDoc.ID } });
                        logger.info(`Updated record for ${fileName} (ID: ${existingDoc.ID})`);
                        documentStatus = 'updated';
                        document = await db.Documents.findOne({ where: { ID: existingDoc.ID } });
                    } else {
                        document = await db.Documents.create(documentData);
                        logger.info(`Inserted new record for ${fileName}`);
                        documentStatus = 'inserted';
                    }
                } catch (dbErr) {
                    logger.error(`DB error for ${fileName}: ${dbErr.message}`);
                    throw dbErr;
                }

                // Match and upload file from ZIP if available
                if (fileMap && isZipFile) {
                    try {
                        const matchedFilePath = matchFileToRow(fileName, fileMap);
                        
                        if (matchedFilePath) {
                            fileMatched = true;
                            logger.info(`Matched file for ${fileName}: ${matchedFilePath}`);
                            
                            // Read file and get type
                            const { buffer, type } = await readFileWithType(matchedFilePath);
                            
                            // Calculate page count if PDF
                            let pageCount = 0;
                            if (type === 'pdf') {
                                try {
                                    pageCount = await calculatePageCount(buffer, 'application/pdf');
                                } catch (pageErr) {
                                    logger.warn(`Error calculating page count for ${fileName}: ${pageErr.message}`);
                                    pageCount = rowData['Page Count'] || 0;
                                }
                            } else {
                                pageCount = rowData['Page Count'] || 0;
                            }
                            
                            // Update document with file data
                            const fileUpdateData = {
                                DataImage: buffer,
                                DataName: path.basename(matchedFilePath),
                                DataType: type,
                                PageCount: pageCount > 0 ? pageCount : null
                            };
                            
                            await db.Documents.update(fileUpdateData, { where: { ID: document.ID } });
                            
                            // Refresh document to get updated data
                            document = await db.Documents.findOne({ where: { ID: document.ID } });
                            
                            logger.info(`File uploaded successfully for ${fileName} (Type: ${type}, Size: ${buffer.length} bytes)`);
                        } else {
                            logger.warn(`No matching file found in ZIP for ${fileName}`);
                        }
                    } catch (fileErr) {
                        logger.error(`Error uploading file for ${fileName}: ${fileErr.message}`);
                        // Don't fail the whole process, just log the error
                    }
                }

                // Create initial DocumentVersions entry if it doesn't exist
                try {
                    const existingVersion = await db.DocumentVersions.findOne({
                        where: { 
                            DocumentID: document.ID,
                            LinkID: document.LinkID,
                            IsCurrentVersion: true,
                            Active: true
                        }
                    });

                    if (!existingVersion) {
                        // Mark any existing versions as not current
                        await db.DocumentVersions.update(
                            { IsCurrentVersion: false },
                            { where: { LinkID: document.LinkID } }
                        );

                        // Create initial version entry
                        await db.DocumentVersions.create({
                            DocumentID: document.ID,
                            LinkID: document.LinkID,
                            VersionNumber: '1',
                            ModificationDate: document.CreatedDate || new Date(),
                            ModifiedBy: document.Createdby || rowData['Created By'] || 'System',
                            Changes: JSON.stringify({ action: documentStatus === 'inserted' ? 'Initial creation' : 'Updated via batch upload' }),
                            IsCurrentVersion: true,
                            Active: true
                        });
                        logger.info(`Created initial version for document ${fileName} (ID: ${document.ID})`);
                    }
                } catch (versionErr) {
                    logger.warn(`Failed to create version entry for ${fileName}: ${versionErr.message}`);
                    // Don't fail the whole batch if version creation fails
                }

                // Create audit trail entry for document creation/update
                try {
                    // Get user ID from request (must be a valid numeric user ID)
                    let userId = req.user?.id || req.user?.ID || req.body?.userId || req.body?.userID;
                    
                    // If we have a numeric ID, validate it exists; otherwise find or use system user
                    if (userId && !isNaN(userId)) {
                        userId = Number(userId);
                        const userExists = await db.Users.findByPk(userId);
                        if (!userExists) {
                            userId = null; // Invalid user ID, will fallback to system user
                        }
                    } else {
                        userId = null;
                    }
                    
                    // Fallback: Find a system/admin user or first active user
                    if (!userId) {
                        const systemUser = await db.Users.findOne({
                            where: { 
                                Active: true,
                                // Optionally match by username if you have a 'System' user
                                userName: 'System'
                            },
                            attributes: ['ID']
                        });
                        
                        if (systemUser) {
                            userId = systemUser.ID;
                        } else {
                            // Last resort: get first active user
                            const firstUser = await db.Users.findOne({
                                where: { Active: true },
                                attributes: ['ID'],
                                order: [['ID', 'ASC']]
                            });
                            userId = firstUser ? firstUser.ID : null;
                        }
                    }
                    
                    // Only create audit trail if we have a valid user ID
                    if (userId) {
                        // Prepare document data for audit trail (without DataImage blob)
                        const docForAudit = typeof document.toJSON === 'function' ? document.toJSON() : { ...document };
                        if (docForAudit.DataImage) delete docForAudit.DataImage;
                        
                        // Prepare old values for update (if existingDoc was found)
                        let oldValuesForAudit = null;
                        if (existingDoc) {
                            oldValuesForAudit = { ...existingDoc };
                            if (oldValuesForAudit.DataImage) delete oldValuesForAudit.DataImage;
                        }
                        
                        await logAuditTrail(
                            document.ID,
                            existingDoc ? 'UPDATED' : 'CREATED',
                            userId,
                            oldValuesForAudit ? JSON.stringify(oldValuesForAudit) : null,
                            JSON.stringify(docForAudit),
                            req,
                            document.LinkID
                        );
                        logger.info(`Created audit trail entry for document ${fileName} (ID: ${document.ID}, Action: ${existingDoc ? 'UPDATED' : 'CREATED'}, User: ${userId})`);
                    } else {
                        logger.warn(`Skipping audit trail for ${fileName}: No valid user ID found`);
                    }
                } catch (auditErr) {
                    logger.warn(`Failed to create audit trail entry for ${fileName}: ${auditErr.message}`);
                    // Don't fail the whole batch if audit trail creation fails
                }

                // Materialize a PDF/Image to disk if available, now that we have a persisted document
                if (document && document.DataImage && document.DataImage.length > 0) {
                    const dir = path.join(__dirname, `../public/images/templates/document_${document.ID}`);
                    try {
                        await fs.mkdir(dir, { recursive: true });
                        filePath = path.join(dir, `${timestamp}.pdf`).trim();
                        await fs.writeFile(filePath, document.DataImage);
                        const normalizedPath = path.normalize(filePath);
                        await fs.access(normalizedPath, fs.constants.F_OK);
                        pdfFilePath = normalizedPath;
                        pdfExists = true;
                        logger.info(`PDF file materialized: ${filePath}`);
                    } catch (err) {
                        logger.warn(`PDF file not available for document ${document.ID}. Skipping OCR.`);
                    }
                }

                // Calculate and persist page count if possible
                try {
                    let pageCount = 0;
                    if (pdfExists && pdfFilePath) {
                        const pdfBuffer = await fs.readFile(pdfFilePath);
                        pageCount = await calculatePageCount(pdfBuffer, 'application/pdf');
                    } else {
                        pageCount = rowData['Page Count'] || 0;
                    }
                    if (typeof pageCount === 'number' && pageCount > 0) {
                        await db.Documents.update({ PageCount: pageCount }, { where: { ID: document.ID } });
                    }
                } catch (error) {
                    logger.warn(`Error calculating page count for ${fileName}: ${error.message}`);
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
                    const outputDir = path.resolve(__dirname, `../public/images/templates/document_${document.ID}`);

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
                    if(document.DataType=="pdf"||document.DataType==".pdf"){
                        await convertPdfBufferToImages(buffer, outputDir);
                    }
                    else{
                        const uuid=uuidv4()
                        const outputDirPath = path.join(outputDir, `${uuid}.png`);
                        await fs.writeFile(outputDirPath, document.DataImage);
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
                    try {
                        await fs.rm(outputDir, { recursive: true, force: true });
                    } catch (cleanupErr) {
                        logger.warn(`Failed to cleanup output directory ${outputDir}: ${cleanupErr.message}`);
                    }
                } else {
                    documentStatus += ' (PDF not found)';
                }

                successfulUpdates++;
                const resultEntry = { fileName, status: documentStatus };
                if (isZipFile) {
                    resultEntry.fileMatched = fileMatched;
                    if (!fileMatched) {
                        resultEntry.error = 'File not found in ZIP';
                    }
                }
                processedDocuments.push(resultEntry);
              
            } catch (err) {
                logger.error(`Failed to process document ${fileName}: ${err.message}`);
                console.log("err",err)
                const errorEntry = { fileName, status: `Failed: ${err.message}`, error: err.message };
                if (isZipFile) {
                    errorEntry.fileMatched = false;
                }
                processedDocuments.push(errorEntry);
                failedUpdates++;
            }
        }

        logger.info('Batch processing completed.');
        
        // Cleanup extracted ZIP directory if it exists
        if (extractedZipDir) {
            await cleanupTempDirectory(extractedZipDir);
        }
        
        return res.status(200).json({
            message: isZipFile ? 'ZIP processing completed.' : 'Batch processing completed.',
            totalDocuments: excelDataTable.length,
            successfulUpdates,
            failedUpdates,
            processedDocuments
        });

    } catch (mainError) {
        logger.error(`Unhandled error: ${mainError.message}`);
        logger.error(mainError.stack);
        console.log(mainError);
        
        // Cleanup extracted ZIP directory on error
        if (extractedZipDir) {
            await cleanupTempDirectory(extractedZipDir);
        }
        
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
                    // Calculate page count from existing document if available
                    let pageCount = rowData['Page Count'] || 0;
                    if (existingDoc && existingDoc.DataImage) {
                        try {
                            pageCount = await calculatePageCount(existingDoc.DataImage, 'application/pdf');
                        } catch (error) {
                            logger.warn(`Error calculating page count for ${fileName}: ${error.message}`);
                            // Keep the Excel value as fallback
                        }
                    }
                    
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
                        'Page Count': pageCount,
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