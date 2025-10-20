const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');

/**
 * Calculate page count for different file types
 * @param {Buffer} fileBuffer - The file buffer
 * @param {string} mimeType - The MIME type of the file
 * @returns {Promise<number>} - The number of pages
 */
async function calculatePageCount(fileBuffer, mimeType) {
  try {
    // Handle PDF files
    if (mimeType === 'application/pdf' || mimeType === 'pdf') {
      return await calculatePdfPageCount(fileBuffer);
    }
    
    // Handle image files (single page)
    if (mimeType.startsWith('image/')) {
      return 1;
    }
    
    // Handle other file types (assume single page)
    return 1;
    
  } catch (error) {
    console.error('Error calculating page count:', error);
    // Return 1 as fallback
    return 1;
  }
}

/**
 * Calculate page count for PDF files
 * @param {Buffer} pdfBuffer - The PDF buffer
 * @returns {Promise<number>} - The number of pages in the PDF
 */
async function calculatePdfPageCount(pdfBuffer) {
  try {
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    return pdfDoc.getPageCount();
  } catch (error) {
    console.error('Error calculating PDF page count:', error);
    // Fallback: try to count pages using pdf-parse
    try {
      const pdfParse = require('pdf-parse');
      const data = await pdfParse(pdfBuffer);
      return data.numpages || 1;
    } catch (parseError) {
      console.error('Error with pdf-parse fallback:', parseError);
      return 1;
    }
  }
}

/**
 * Calculate page count for image files (including multi-page TIFF)
 * @param {Buffer} imageBuffer - The image buffer
 * @param {string} mimeType - The MIME type
 * @returns {Promise<number>} - The number of pages
 */
async function calculateImagePageCount(imageBuffer, mimeType) {
  try {
    // For multi-page TIFF files, we need to use a library that can handle them
    if (mimeType === 'image/tiff' || mimeType === 'image/tif') {
      // For now, assume single page for TIFF
      // TODO: Implement proper TIFF page counting if needed
      return 1;
    }
    
    // For other image types, assume single page
    return 1;
  } catch (error) {
    console.error('Error calculating image page count:', error);
    return 1;
  }
}

module.exports = {
  calculatePageCount,
  calculatePdfPageCount,
  calculateImagePageCount
};
