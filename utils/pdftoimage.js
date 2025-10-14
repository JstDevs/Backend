// --- Required Imports ---
const path = require('path');
const fs = require('fs').promises; // Using promises-based fs for async operations
const ExcelJS = require('exceljs'); // Excel file reading/writing
const Tesseract = require('tesseract.js'); // OCR engine wrapper
const { PDFDocument } = require('pdf-lib'); // PDF manipulation (splitting, merging)
const winston = require('winston'); // Logging library
require('dotenv').config();        // Load environment variables from .env
const { convert } = require('pdf-poppler');
const pdf = require('pdf-parse');
const sharp = require('sharp');
const os = require('os');
const outputDir = path.resolve(__dirname, 'output');
const fsextra = require('fs-extra');
const { createCanvas } = require('canvas');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.mjs')

async function convertPDFToImage(pdf, outDir) {
 fs.mkdir(outDir, { recursive: true });

  const options = {
    format: 'png',
    out_dir: outDir,
    out_prefix: 'page',
    page: null,
  };

  await convert(pdf, options);
  console.log('✅ PDF converted to images');
}

const pdfpath = path.join(__dirname, '../Controllers/uploads/Build Grit- How to Grow Guts, Develop Willpower, and Never Give Up- Strength of Character Manual ( PDFDrive ).pdf'); // Path to your PDF file
const outdir= path.join(__dirname, 'output'); // Output directory for images
convertPDFToImage(pdfpath, outdir);
module.exports=convertPDFToImage