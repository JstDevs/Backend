// routes/ocrRoutes.js
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const Tesseract = require('tesseract.js');
const { PDFDocument } = require('pdf-lib');
const sharp = require('sharp');
const multer = require('multer');
const db = require('../config/database'); // Adjust the path as needed
const { v4: uuidv4 } = require('uuid');
const { Poppler } = require('node-poppler');
// Import models (assuming they're already defined)
const Department=db.Department;
const Subdepartment=db.SubDepartment;
const AssignSubdepartment=db.AssignSubDepartment;
const Document=db.Documents;
const Attachment=db.Attachment;
const OCRTemplate=db.Template;
const OCRField=db.OCRFields;
const User=db.Users;
const DocumentAccess=db.DocumentAccess;
const convertPdfBufferToImages=require("../utils/pdftoimages_1")
// const pdf2pic = require('pdf2pic');
// const { fromPath } = require("pdf2pic");
// const { v4: uuidv4 } = require("uuid");
// const gm = require('gm').subClass({ imageMagick: true });
// const { createCanvas } = require('canvas');

// const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js'); // legacy for Node




// await convertPdfBufferToImages("C:/Users/Administrator/Desktop/ocr-test.pdf", "C:/Users/Administrator/Desktop/ocr-test");
// Configure multer for file uploads
const upload = multer({ dest: 'temp/' });

// Get all departments
router.get('/departments', async (req, res) => {
  try {
    const departments = await Department.findAll({
      include: [{
        model: AssignSubdepartment,
        include: [Subdepartment],
        where: { active: true }
      }],
      where: { active: true },
      order: [['name', 'ASC']]
    });

    res.json({
      success: true,
      data: departments
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching departments',
      error: error.message
    });
  }
});

// Get subdepartments by department ID
router.get('/departments/:departmentId/subdepartments', async (req, res) => {
  try {
    const { departmentId } = req.params;
    
    const subdepartments = await AssignSubdepartment.findAll({
      include: [Subdepartment],
      where: { 
        departmentId: departmentId,
        active: true 
      },
      order: [[Subdepartment, 'name', 'ASC']]
    });

    res.json({
      success: true,
      data: subdepartments
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching subdepartments',
      error: error.message
    });
  }
});

// Get OCR templates by link ID
router.get('/templates/:linkId', async (req, res) => {
  try {
    const { linkId } = req.params;
    
    const templates = await OCRTemplate.findAll({
      where: { linkId: linkId }
    });

    res.json({
      success: true,
      data: templates
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching OCR templates',
      error: error.message
    });
  }
});

// Get unrecorded documents
router.get('/documents/unrecorded/:dep/:subdep/:userid', async (req, res) => {
  try {
    const { dep,subdep,userid } = req.params;
    

    // Check user permissions
    // const userAccess = await DocumentAccess.findOne({
    //   where: {
    //     userId: userid,
        
    //   }
    // });

    // if (!userAccess || !userAccess.View) {
    //   return res.status(403).json({
    //     success: false,
    //     message: 'You do not have permission to view these documents'
    //   });
    // }

    // Get unrecorded documents count
   
    // Get filtered unrecorded documents
    const documents = await Document.findAll({
      where:{DepartmentId:dep,SubDepartmentId:subdep,Active:true},
      order: [['createdDate', 'DESC']],
      attributes: { exclude: ['DataImage'] }
    });

    const unrecordedfields=await db.OCRDocumentReadFields.findAll({})
    const unrecordedDocumentIDs = new Set(unrecordedfields.map(f => parseInt(f.DocumentID)));
    // console.log("udn",unrecordedDocumentIDs)
    const documentswithocrreadfields=documents.filter((e)=>!unrecordedDocumentIDs.has(e.ID))
    res.json({
      success: true,
      data: {
        // documents,
        documentswithocrreadfields,
        count: documentswithocrreadfields.length
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching unrecorded documents',
      error: error.message
    });
  }
});

// Preview document attachment
router.get('/documents/:documentId/preview', async (req, res) => {
  try {
    const { documentId } = req.params;
    
    const attachment = await Attachment.findOne({
      where: { linkId: documentId }
    });

    if (!attachment) {
      return res.status(404).json({
        success: false,
        message: 'Attachment not found'
      });
    }

    // Write file to temp directory
    const tempFilePath = path.join(__dirname, '../temp', `preview_${documentId}`);
    fs.writeFileSync(tempFilePath, attachment.dataImage);

    res.json({
      success: true,
      data: {
        fileType: attachment.dataType,
        filePath: tempFilePath,
        hasData: true
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error previewing document',
      error: error.message
    });
  }
});

// Run OCR on document
router.post('/documents/:documentId/ocr', async (req, res) => {
  try {
    const { documentId } = req.params;
    const { templateName, linkId, userId } = req.body;

    // Check user permissions
    const userAccess = await DocumentAccess.findOne({
      where: {
        userId: userId,
        linkId: linkId
      }
    });

    // if (!userAccess || !userAccess.edit) {
    //   return res.status(403).json({
    //     success: false,
    //     message: 'You do not have permission to edit documents'
    //   });
    // }

    // Get OCR template fields

      const OCRTemplate = await db.Template.findAll({
                                where: {
                                    // 'Link ID': linkId,
                                    'name': templateName
                                },
                            });
    if (!OCRTemplate || OCRTemplate.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'OCR template not found'
      });
    }
    const ocrFields = OCRTemplate[0].fields; // Assuming fields is an array of field objects
    const TemplateID = OCRTemplate[0].ID;
    // const ocrFields = await OCRField.findAll({
    //   where: {
    //     linkId: linkId,
    //     templateName: templateName
    //   }
    // });
    // console.log('OCR Fields:', ocrFields);

    if (ocrFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No OCR fields found for this template'
      });
    }
// Get the document to update
    const document = await Document.findOne({
      where: { id: documentId }
    });
    // Get document attachment
    const attachment = document
    // console.log("attachment",attachment)

    if (!attachment) {
      return res.status(404).json({
        success: false,
        message: 'Document attachment not found'
      });
    }
    // console.log("attachment",attachment)
    // Create temp files
    const tempDir = path.join(__dirname, '../temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const ocrFilePath = path.join(tempDir, 'OCR_File');
    const ocrWorkPath = path.join(tempDir, 'OCR_Work');
    
    fs.writeFileSync(ocrFilePath, attachment.DataImage);
    fs.writeFileSync(ocrWorkPath, attachment.DataImage);
    // return
    // Process OCR for each field
    const ocrResults = [];
     let imageBuffer;
      
      if (attachment.DataType === '.pdf'||attachment.DataType === 'pdf') {
        // For PDF files, you'd need to convert to image first
        // This is a simplified example - you might want to use pdf2pic or similar
      fs.mkdirSync(path.join(__dirname,"/uploads/temp"),{recursive:true})
      const filename=new Date().getTime()+".png";
      const imagebuffer=await convertPdfBufferToImages(attachment.DataImage, path.join(__dirname,"/uploads/temp"),filename);
        // console.log("imagebuffer",imagebuffer)
        
        imageBuffer = imagebuffer.buffer;
      } else {
        imageBuffer = attachment.DataImage;
      }
    for (let i = 0; i < ocrFields.length; i++) {
      const field = ocrFields[i];
      
      // Convert PDF to image if needed and crop the region
     
// Calculate scaling factors
// const scaleX = actualWidth / templateImageWidth;
// const scaleY = actualHeight / templateImageHeight;

// const croppedImage = await sharp(imageBuffer)
//   .extract({
//     left: Math.round(field.x * scaleX),
//     top: Math.round(field.y * scaleY),
//     width: Math.round(field.width * scaleX),
//     height: Math.round(field.height * scaleY),
//   })
//   .toBuffer();
console.log("field",field)
console.log({
          name:field.fieldName,
           left: Math.round(field.x ),
          top:field.y,
          width: Math.round(field.width ),
          height: Math.round(field.height)
        })
      // Crop the image to the specified region
      const adjustedTop = 791 - field.y - field.height;
      const croppedImage = await sharp(imageBuffer)
        .extract({
          left: Math.round(field.x ),
          top:Math.round(field.y),
          width: Math.round(field.width ),
          height: Math.round(field.height)
        })
        .toBuffer();
        // console.log("cropped image",croppedImage)
        //save file in temp folder
      const croppedImagePath = path.join(tempDir, `cropped_${field.fieldName}.png`);
      fs.writeFileSync(croppedImagePath, croppedImage);
      // return
        // return
      // Run OCR on the cropped region
      const { data: { text } } = await Tesseract.recognize(croppedImage, 'eng');
      
      // Process OCR results
      const processedText = await processOCRText(text);
      const newprocess={
        fieldName: field.fieldName,
        text: processedText.join(' '),
      }
      ocrResults.push(newprocess);
    }

    

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    // Update document with OCR results
    const updateData = {};
    const currentDate = new Date();

    // Map OCR results to text and date fields
    for (let i = 0; i < Math.min(ocrResults.length, 10); i++) {
      const textField = `text${i + 1}`;
      const dateField = `date${i + 1}`;
      
      updateData[textField] = ocrResults[i] || '';
      updateData[dateField] = ocrResults[i] ? currentDate : currentDate;
    }

    await document.update(updateData);

    // Clean up temp files
    try {
      fs.unlinkSync(ocrFilePath);
      fs.unlinkSync(ocrWorkPath);
    } catch (cleanupError) {
      console.warn('Failed to clean up temp files:', cleanupError.message);
    }
    //save ocr results in OCRDocumentReadFields table
    for (let i = 0; i < ocrResults.length; i++) {
      // console.log("document",document)
      // await db.OCRDocumentReadFields.create({
      //   DocumentID: document.ID,
      //   LinkId: document.LinkID,
      //   Field: ocrResults[i].fieldName,
      //   Value: ocrResults[i].text,
      //   template_id: TemplateID // Assuming template ID is available
      
      // });

       const existing = await db.OCRDocumentReadFields.findOne({
          where: {
            LinkId: document.LinkID,
            Field: ocrResults[i].fieldName,
            template_id: TemplateID
          }
        });

        if (existing) {
          await existing.update({
            Value: ocrResults[i].text,
            LinkId: document.LinkID // optionally update other fields
          });
        } else {
          await db.OCRDocumentReadFields.create({
            DocumentID: document.ID,
            LinkId: document.LinkID,
            Field: ocrResults[i].fieldName,
            Value: ocrResults[i].text,
            template_id: TemplateID
          });
  }
    }
    res.json({
      success: true,
      message: 'OCR processing completed successfully',
      data: {
        ocrResults: ocrResults,
        updatedDocument: await document.reload()
      }
    });

  } catch (error) {
    console.error('Error running OCR:', error);
    res.status(500).json({
      success: false,
      message: 'Error running OCR',
      error: error.message
    });
  }
});

// Search documents
router.get('/documents/search/:linkId', async (req, res) => {
  try {
    const { linkId } = req.params;
    const { search = '', userId } = req.query;

    // Check user permissions
    const userAccess = await DocumentAccess.findOne({
      where: {
        userId: userId,
        linkId: linkId
      }
    });

    if (!userAccess || !userAccess.view) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to view these documents'
      });
    }

    const documents = await Document.findAll({
      where: {
        linkId: linkId,
        fileName: { [Op.like]: `%${search}%` },
        text1: '',
        text2: '',
        text3: '',
        text4: '',
        text5: '',
        text6: '',
        text7: '',
        text8: '',
        text9: '',
        text10: ''
      },
      order: [['createdDate', 'DESC']]
    });

    res.json({
      success: true,
      data: documents
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error searching documents',
      error: error.message
    });
  }
});

// Helper function to process OCR text (equivalent to OCRSeparationAndValidation)
async function processOCRText(text) {
  const parts = text.split(/\r?\n/);
  const temp = [];
  const result = [];
  let blank = 0;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i].trim();
    
    if (part !== '') {
      temp.push(part);
      blank = 0;
    } else {
      blank++;
    }

    // Check conditions for adding to result
    if ((blank === 3 && temp.length > 0) || (blank === 4 && temp.length > 0)) {
      result.push(temp.join(''));
      temp.length = 0; // Clear array

      if (blank === 4) {
        result.push('');
        blank = 0;
      }
    } else if (blank === 4 && temp.length === 0) {
      result.push('');
      blank = 0;
    }

    // Check end conditions
    if (i === parts.length - 1) {
      if (temp.length > 0) {
        result.push(temp.join(''));
        temp.length = 0;
      } else if (blank === 4) {
        result.push('');
      }
    }
  }

  return result;
}

// Get user permissions for a link
router.get('/permissions/:userId/:linkId', async (req, res) => {
  try {
    const { userId, linkId } = req.params;

    const permissions = await DocumentAccess.findOne({
      include: [User],
      where: {
        userId: userId,
        linkId: linkId
      }
    });

    res.json({
      success: true,
      data: permissions
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching permissions',
      error: error.message
    });
  }
});


// GET all fields
router.get('/fields', async (req, res) => {
  try {
    const fields = await db.OCRavalibleFields.findAll();
    res.json({status:true,data:fields});
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch fields' });
  }
});

// GET a single field by ID
router.get('/fields/:id', async (req, res) => {
  try {
    const field = await db.OCRavalibleFields.findByPk(req.params.id);
    if (!field) return res.status(404).json({ error: 'Field not found' });
    res.json({status:true,data:field});
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch field' });
  }
});

// POST (create) a new field
router.post('/fields', async (req, res) => {
  try {
    const { Field } = req.body;
    if (!Field) return res.status(400).json({ error: 'Field is required' });

    const newField = await db.OCRavalibleFields.create({ Field });
    res.status(201).json(newField);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create field' });
  }
});

// PUT (update) a field by ID
router.put('/fields/:id', async (req, res) => {
  try {
    const { Field } = req.body;
    const field = await db.OCRavalibleFields.findByPk(req.params.id);
    if (!field) return res.status(404).json({ error: 'Field not found' });

    field.Field = Field || field.Field;
    await field.save();
    res.json(field);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update field' });
  }
});

// DELETE a field by ID
router.delete('/fields/:id', async (req, res) => {
  try {
    const field = await db.OCRavalibleFields.findByPk(req.params.id);
    if (!field) return res.status(404).json({ error: 'Field not found' });

    await field.destroy();
    res.json({ message: 'Field deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete field' });
  }
});

module.exports = router;