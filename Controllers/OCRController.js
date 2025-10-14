const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs/promises');
const os = require('os');
const sharp = require('sharp');
const Tesseract = require('tesseract.js');
const db = require('../config/database'); 
const Template = db.Template
const Unrecorded = db.Unrecorded; // Assuming you have an Unrecorded model for failed OCR attempts
const router = express.Router();



// Multer setup: store uploads in ./uploads folder (make sure folder exists)
const upload = multer({
  dest: path.join(__dirname, 'uploads'),
  limits: { fileSize: 10 * 1024 * 1024 } // max 10MB
});

// Helper function: crop each field area and OCR it
async function extractDataWithTemplate(template, imagePath) {
  const extractedData = {};
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ocr-field-'));

  try {
    for (const field of template.fields) {
      const { fieldName, x, y, width, height } = field;

      const croppedImagePath = path.join(tmpDir, `${fieldName}.png`);
      const tocrop={ left: Math.round(x), top: Math.round(y), width: Math.round(width), height: Math.round(height) }
      console.log(`Cropping ${fieldName} at`, tocrop);
      await sharp(imagePath)
        .extract(tocrop)
        .toFile(croppedImagePath);

      const { data: { text } } = await Tesseract.recognize(croppedImagePath, 'eng');
      extractedData[fieldName] = text.trim();

      await fs.unlink(croppedImagePath);
    }

    await fs.rmdir(tmpDir);
    return extractedData;

  } catch (error) {
    // Cleanup on error
    try {
      const files = await fs.readdir(tmpDir);
      await Promise.all(files.map(f => fs.unlink(path.join(tmpDir, f))));
      await fs.rmdir(tmpDir);
    } catch (_) { /* ignore */ }
    throw error;
  }
}

// POST /ocr/process-document
// Accepts form-data: departmentId, subDepartmentId, document (file)
router.post('/process-document', upload.single('document'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const { departmentId, subDepartmentId } = req.body;
  if (!departmentId || !subDepartmentId) {
    return res.status(400).json({ error: 'departmentId and subDepartmentId are required' });
  }

  try {
    // Find matching template
    const template = await Template.findOne({
      where: { departmentId, subDepartmentId }
    });

    if (!template) {
      return res.status(404).json({ error: 'No matching template found' });
    }

    // Extract OCR data from image fields
    const extractedData = await extractDataWithTemplate(template, req.file.path);

    // Send extracted data in response
    console.log('Extracted Data:', extractedData);
    res.json({ success: true, data: extractedData });

  } catch (error) {
    console.error('OCR processing failed:', error);

    // Save failed document info for manual review
    try {
      await Unrecorded.create({
        departmentId,
        subDepartmentId,
        filePath: req.file.path,
        errorMessage: error.message,
        originalName: req.file.originalname,
        uploadedAt: new Date()
      });
    } catch (saveErr) {
      console.error('Failed to save unrecorded document:', saveErr);
    }

    res.status(500).json({ error: 'OCR processing failed, document saved for review' });
  }
});




module.exports = router;
