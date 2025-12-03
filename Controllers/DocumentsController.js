const express = require('express');
const { Sequelize, DataTypes, Op, or } = require('sequelize');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;

const { spawn } = require('child_process');
const router = express.Router();
const db = require('../config/database');
const { checkUserPermission, diagnosePermissionIssue } = require('../utils/checkPermission'); 
const DocumentApprovers = db.DocumentApprovers;
const { calculatePageCount } = require('../utils/calculatePageCount');
// Configure multer for file uploads
const storage = multer.memoryStorage();
const bluritout=require("../utils/blurFile")
const convertPdfBufferToImages=require("../utils/pdftoimages_1")
// const storage = multer.diskStorage({
//   destination: function (req, file, cb) {
//     cb(null, 'uploads/'); // Folder to save files
//   },
//   filename: function (req, file, cb) {
//     const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
//     const ext = path.extname(file.originalname); // Get original file extension
//     cb(null, file.fieldname + '-' + uniqueSuffix + ext); // e.g. file-1722342342.png
//   }
// });
const generateLinkID = require("../utils/generateID")
const upload = multer({ storage: storage });
const requireAuth = require('../middleware/requireAuth');
const { raw } = require('mysql2');
const Department = db.Department;
const SubDepartment= db.SubDepartment
const AssignSubDepartment=db.AssignSubDepartment
const Documents = db.Documents;
const Fields = db.Fields;
const pdf2pic = require('pdf2pic');




// Helper functions

function buildWhereClause(search) {
  const { Op } = require('sequelize');
  const where = { Active: true };

  if (search) {
    where[Op.or] = [
      { DataName: { [Op.like]: `%${search}%` } },
      { FileName: { [Op.like]: `%${search}%` } },
      { Remarks: { [Op.like]: `%${search}%` } }
    ];
  }

  return where;
}

/**
 * Parse version string into major and minor components
 * @param {string} versionString - e.g., "v1", "v1.1", "v2.3"
 * @returns {Object} { major: number, minor: number | null }
 */
function parseVersion(versionString) {
  if (!versionString || typeof versionString !== 'string') {
    return { major: 1, minor: null };
  }
  
  // Remove 'v' prefix (case insensitive)
  const version = versionString.replace(/^v/i, '');
  
  // Split by dot
  const parts = version.split('.');
  
  const major = parseInt(parts[0], 10) || 1;
  const minor = parts.length > 1 ? parseInt(parts[1], 10) : null;
  
  return { major, minor };
}

/**
 * Calculate next version based on flags
 * @param {string} currentVersion - Current version string (e.g., "v1", "v1.1")
 * @param {boolean} isMinorVersion - If true, create minor version
 * @param {boolean} finalize - If true, finalize and bump major version
 * @returns {string} New version string
 */
function incrementVersion(currentVersion, isMinorVersion, finalize) {
  console.log('🔍 [incrementVersion] Called with:');
  console.log('  - currentVersion:', currentVersion);
  console.log('  - isMinorVersion:', isMinorVersion, '(type:', typeof isMinorVersion, ')');
  console.log('  - finalize:', finalize, '(type:', typeof finalize, ')');
  
  const { major, minor } = parseVersion(currentVersion);
  console.log('  - Parsed: major=', major, ', minor=', minor);
  
  // Finalize takes priority: bump major, reset minor
  if (finalize) {
    const result = `v${major + 1}`;
    console.log('  - Finalize=true, returning:', result);
    return result;
  }
  
  // Minor version: increment minor, or create .1 if none exists
  if (isMinorVersion) {
    let result;
    if (minor === null) {
      result = `v${major}.1`;
    } else {
      result = `v${major}.${minor + 1}`;
    }
    console.log('  - isMinorVersion=true, returning:', result);
    return result;
  }
  
  // Default: treat as minor version (backward compatibility)
  // This ensures existing code without flags still works
  let result;
  if (minor === null) {
    result = `v${major}.1`;
  } else {
    result = `v${major}.${minor + 1}`;
  }
  console.log('  - Default (backward compatibility), returning:', result);
  return result;
}


async function processDocument(doc, restrictions, OCRFields, templates, skipCache = false) {
  const restrictions_open_draw = restrictions.map(r => r.dataValues);

  const docJson = doc.toJSON();
  const timestampfocdocumentlinkid=new Date().getTime()+"_"+doc.LinkID
  
  console.log("Processing document ID:", doc.ID, "SkipCache:", skipCache)
  const dir = path.join(__dirname, `../public/images/redacteddocs/document_${doc.ID}`);
  const temppath=path.join(__dirname, `../public/images/nonredacteddocs/document_${doc.ID}`)
  const pathrelativetoserver=`document_${doc.ID}`
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(temppath)) fs.mkdirSync(temppath, { recursive: true });
  
  const isRestricted = restrictions.some(r => r.DocumentID === doc.ID);
  const matchedField = OCRFields.find(field => field.LinkId === doc.LinkID);
  const templateId = matchedField ? matchedField.template_id : null;
  
  // ⚡ OPTIMIZATION: Only check cache if not forced to skip
  if (!skipCache) {
    // Check if images already exist (cached)
    const existingFiles = fs.existsSync(temppath) ? fs.readdirSync(temppath) : [];
    const hasCachedImage = existingFiles.length > 0;
    
    // console.log("Cached image exists:", hasCachedImage, "Files:", existingFiles.length);

    // ⚡ OPTIMIZATION: Early exit - if cached image exists and no restrictions, use cache
    if (hasCachedImage && !isRestricted && !templateId) {
      const latestFile = existingFiles.sort().reverse()[0];
      const cachedUrl = `${process.env.BASE_URL}/static/public/nonredacteddocs/${pathrelativetoserver}/${latestFile}`;
      
      delete docJson.DataImage;
      return {
        ...docJson,
        isRestricted: false,
        filepath: cachedUrl,
        template_id: null,
        restrictions: []
      };
    }
    
    // ⚡ OPTIMIZATION: If cached image exists, use it (for restriction checking)
    if (hasCachedImage) {
      const latestFile = existingFiles.sort().reverse()[0];
      
      // Check if redacted version exists
      const redactedFiles = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
      
      let fileUrl = '';
      if (isRestricted && redactedFiles.length > 0) {
        const redactedFile = redactedFiles.sort().reverse()[0];
        fileUrl = `${process.env.BASE_URL}/static/public/redacteddocs/${pathrelativetoserver}/${redactedFile}`;
      } else {
        fileUrl = `${process.env.BASE_URL}/static/public/nonredacteddocs/${pathrelativetoserver}/${latestFile}`;
      }
      
      delete docJson.DataImage;
      return {
        ...docJson,
        isRestricted,
        filepath: fileUrl,
        template_id: templateId,
        restrictions: isRestricted ? restrictions.filter(r => r.DocumentID === doc.ID) : []
      };
    }
  }

  // Only process if we need to generate new images
  // ⚡ Check if DataImage is available (might be excluded in some queries)
  if (!doc.DataImage) {
    console.error('DataImage not available for document ID:', doc.ID);
    // Return cached URL if available
    const existingFiles = fs.existsSync(temppath) ? fs.readdirSync(temppath) : [];
    if (existingFiles.length > 0) {
      const latestFile = existingFiles.sort().reverse()[0];
      const cachedUrl = `${process.env.BASE_URL}/static/public/nonredacteddocs/${pathrelativetoserver}/${latestFile}`;
      delete docJson.DataImage;
      return {
        ...docJson,
        isRestricted,
        filepath: cachedUrl,
        template_id: templateId,
        restrictions: isRestricted ? restrictions.filter(r => r.DocumentID === doc.ID) : []
      };
    }
    // If no cache and no DataImage, return error
    throw new Error(`No image data available and no cached images for document ID: ${doc.ID}`);
  }
  
  let imageBuffer = doc.DataImage;
  let fileUrl = '';

  // if (doc.DataType === '.pdf' || doc.DataType === 'pdf') {
  //   const imageConversion = await convertPdfBufferToImages(doc.DataImage,temppath,timestampfocdocumentlinkid);
  //   imageBuffer = imageConversion.buffer;
  //   const filename=imageConversion.file
  //   // console.log("pdftoimagebuffer")
  //   fileUrl = `${process.env.BASE_URL}/static/public/nonredacteddocs/${pathrelativetoserver}/${filename}`;
  //   // fileUrl=pdftimedpath
  // }else{
  //   const filePath = path.join(temppath, timestampfocdocumentlinkid+".png");
  //   fs.writeFileSync(filePath, doc.DataImage);
  //   fileUrl = `${process.env.BASE_URL}/static/public/nonredacteddocs/${pathrelativetoserver}/${timestampfocdocumentlinkid}.png`;
  //   // console.log("directimagebuffer")
  //   // fileUrl=imagepath
  // }

  if (doc.DataType === '.pdf' || doc.DataType === 'pdf') {
    const imageConversion = await convertPdfBufferToImages(
        doc.DataImage,
        temppath,
        timestampfocdocumentlinkid
    );

    // ✅ Extra safeguard: ensure we got at least one image
    if (!imageConversion || !imageConversion.buffer || imageConversion.buffer.length === 0) {
        // throw new Error(
        //     `No PNG images generated from PDF at ${temppath}/${timestampfocdocumentlinkid}`
        // );
        throw new Error(`No PNG images generated from PDF at ${temppath}/${timestampfocdocumentlinkid}`);
        // console.warn(`No PNG images generated from PDF at ${temppath}/${timestampfocdocumentlinkid}`);
        // return null;
    }

    imageBuffer = imageConversion.buffer;
    const filename = imageConversion.file;
    fileUrl = `${process.env.BASE_URL}/static/public/nonredacteddocs/${pathrelativetoserver}/${filename}`;
  } else {
      // ✅ Extra safeguard: ensure non-PDF docs have image data
      if (!doc.DataImage || doc.DataImage.length === 0) {
          throw new Error(`No image data provided for non-PDF document at ${temppath}`);
      }

      const filePath = path.join(temppath, `${timestampfocdocumentlinkid}.png`);
      fs.writeFileSync(filePath, doc.DataImage);
      fileUrl = `${process.env.BASE_URL}/static/public/nonredacteddocs/${pathrelativetoserver}/${timestampfocdocumentlinkid}.png`;
  }


  // return
  // console.log("templateId",templateId)
  if (templateId) {
    const template = templates.find(t => t.ID == templateId);
    const templateFields = template?.fields ? JSON.parse(template.fields) : [];

    const blurRegions = templateFields.filter(field =>
      restrictions.some(r => r.DocumentID === doc.ID && r.Field === field.fieldName)
    );

    // Merge both restriction type arrays
    const mergedArray_blur = [...restrictions_open_draw, ...blurRegions];

    // console.log(mergedArray_blur);
    const arethereblurRegions=blurRegions.length
    // console.log("arethereblurRegions",arethereblurRegions)
    let blurredFilename = undefined
    try{
      blurredFilename=await bluritout(imageBuffer, 'output.png', temppath, mergedArray_blur,pathrelativetoserver,dir);
      
    }catch(e){

    }
    fileUrl = arethereblurRegions&&blurredFilename?`${process.env.BASE_URL}/static/public/redacteddocs/${pathrelativetoserver}/${blurredFilename}`:fileUrl
    // console.log("blurredFilename",blurredFilename)
  }
// console.log("Final fileUrl:", fileUrl, "DataImage size:", doc.DataImage?.length || 0);
  
  if (!fileUrl) {
    console.error("ERROR: fileUrl is empty for document ID:", doc.ID);
  }
  
  delete docJson.DataImage;

  const result = {
    ...docJson,
    isRestricted,
    filepath: fileUrl,
    template_id: templateId,
    restrictions: isRestricted ? restrictions.filter(r => r.DocumentID === doc.ID) : []
  };
  
  console.log("Returning document with filepath:", result.filepath);
  
  return result;
}


async function clearDirectory(dirPath) {
  try {
    const files = await fsPromises.readdir(dirPath);
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stat = await fsPromises.lstat(filePath);

      if (stat.isDirectory()) {
        await fsPromises.rm(filePath, { recursive: true, force: true });
      } else {
        await fsPromises.unlink(filePath);
      }
    }
    console.log(`✅ Cleared contents of: ${dirPath}`);
  } catch (err) {
    console.error(`❌ Failed to clear directory: ${dirPath}`, err);
  }
}

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
    console.error('Failed to log audit trail:', error);
  }
};

// Helper function to log collaborator activity
const logCollaboratorActivity = async (documentId, collaboratorId, activityType, req = null, details = null, LinkID) => {
  try {
    await db.CollaboratorActivities.create({
      DocumentID: documentId,
      CollaboratorID: collaboratorId,
      ActivityType: activityType,
      ActivityDate: new Date(),
      ActivityDetails: details,
      IPAddress: req?.ip,
      DeviceInfo: req?.get('User-Agent'),
      LinkID: LinkID
    });
  } catch (error) {
    console.error('Failed to log collaborator activity:', error);
  }
};
const loadSubDepartment = async (id, subid) => {
  const department = await Department.findOne({ where: { ID: id } });
  const departmentName = department ? department.Name : 'Unknown';

  const subdepartments = await SubDepartment.findAll({ where: { Active: true } });
  const assignSubDeps = await AssignSubDepartment.findAll({ 
    where: { DepartmentID: id, Active: true } 
  });

  const newSubDepts = [];
  for (const assignSubDep of assignSubDeps) {
    const subdept = subdepartments.find(s => s.ID === assignSubDep.SubDepartmentID);
    if (subdept) {
      newSubDepts.push(subdept);
    }
  }

  const selectedSubDep = newSubDepts.find(s => s.ID === subid);
  const subdepartmentName = selectedSubDep ? selectedSubDep.Name : 'None';

  return {
    id: id.toString(),
    assSubDep: JSON.stringify(newSubDepts),
    subid: subid.toString(),
    depid: id.toString(),
    depname: departmentName,
    subdepid: subid.toString(),
    subdepname: subdepartmentName,
    newSubDepts
  };
};

const loadDocuments = async (linkid) => {
  const documents = await Documents.findAll({ 
    where: { LinkID: linkid, Active: true } 
  });
  return { documents, linkid: linkid.toString() };
};

// Routes
router.get('/', async (req, res) => {
  try {
    const { assSubDep, id, subid } = req.body;
    if (assSubDep && id && assSubDep !== '[]') {
      const departments = await Department.findAll({ where: { Active: true } });
      const subdepartments = JSON.parse(assSubDep);
      const department = await Department.findOne({ 
        where: { Active: true, ID: parseInt(id) } 
      });

      if (parseInt(subid) !== 0) {
        const documents = await db.AssignSubdepartment.findOne({ 
          where: { 
            DepartmentID: parseInt(id), 
            SubDepartmentID: parseInt(subid), 
            Active: true 
          } 
        });
        const subdepartment = await SubDepartment.findOne({ where: { ID: parseInt(subid) } });

        const docData = await loadDocuments(documents ? documents.LinkID : 0);
        
        res.render('documents/index', {
          departments,
          subdepartments,
          documents: docData.documents,
          department: department.Name,
          id: id,
          subid: subdepartment.ID,
          subdepartment: subdepartment.Name,
          linkid: docData.linkid
        });
      } else {
        const documents = await AssignSubdepartment.findOne({ 
          where: { 
            DepartmentID: parseInt(id), 
            SubDepartmentID: subdepartments[0].ID, 
            Active: true 
          } 
        });

        const docData = await loadDocuments(documents ? documents.LinkID : 0);
        
        res.render('documents/index', {
          departments,
          subdepartments,
          documents: docData.documents,
          department: department.Name,
          id: id,
          subid: subdepartments[0].ID,
          subdepartment: subdepartments[0].Name,
          linkid: docData.linkid
        });
      }
    } else {
      res.redirect('/documents/department');
    }
  } catch (error) {
    console.error('Error in index route:', error);
    res.status(500).send('Internal Server Error');
  }
});

router.get('/department/:id/:subid', async (req, res) => {
  try {
    const { id, subid } = req.params;
    
    if (id && parseInt(id) !== 0) {
      const subDeptData = await loadSubDepartment(parseInt(id), parseInt(subid) || 0);
      Object.assign(req.session, subDeptData);
      res.redirect('/documents');
    } else {
      const departments = await AssignSubdepartment.findAll({ where: { Active: true } });
      const subDeptData = await loadSubDepartment(departments[0].DepartmentID, 0);
      Object.assign(req.session, subDeptData);
      res.redirect('/documents');
    }
  } catch (error) {
    console.error('Error in department route:', error);
    res.status(500).send('Internal Server Error');
  }
});



router.get('/view-document/:linkid/:id/alert/depname/subdepname', async (req, res) => {
  try {
    const { linkid, id, alert, depname, subdepname } = req.params;

    if (linkid) {
      const fields = await Fields.findAll({ 
        where: { LinkID: parseInt(linkid), Active: true } 
      });
      
      const selectedDocument = await Documents.findOne({ 
        where: { 
          ID: parseInt(id), 
          LinkID: parseInt(linkid), 
          Active: true 
        } 
      });

      const attachments = await Attachment.findAll({ 
        where: { LinkID: parseInt(id) } 
      });

      res.json( {
        fields,
        document: selectedDocument,
        attachments,
        depname,
        subdepname,
        linkid,
        id,
        alert
      });
    } else {
      res.json({
        status: false,
        message: 'Document not found.'
      });
    }
  } catch (error) {
    console.error('Error in view document route:', error);
    res.status(500).send('Internal Server Error');
  }
});



// router.get('/view-documents/:linkid/:id/:depname/:subdepname', (req, res) => {
//   const { linkid, id, depname, subdepname } = req.params;
//   req.session.id = id;
//   req.session.linkid = linkid;
//   req.session.depname = depname;
//   req.session.subdepname = subdepname;
//   res.redirect('/documents/view-document');
// });

router.post('/editold',upload.single('file'),requireAuth, async (req, res) => {
  try {
    const {
      filename, filedate, Text1, Date1, Text2, Date2, Text3, Date3,
      Text4, Date4, Text5, Date5, Text6, Date6, Text7, Date7,
      Text8, Date8, Text9, Date9, Text10, Date10,
      expiration, confidential, expdate, remarks, id, dep,
subdep,publishing_status,FileDescription,
Description
    } = req.body;
   
    const buffer = req.file ? req.file.buffer : null;
    

    const expirationChecked = expiration === 'true';
    const confidentialChecked = confidential === 'true';
    const document=await db.Documents.findByPk(id)
    const linkid=document.LinkID
    // Validate expiration date
    if (expirationChecked) {
      const parsedExpDate = new Date(expdate);
      if (isNaN(parsedExpDate.getTime()) || parsedExpDate <= new Date()) {
       return res.json({
          status: false,
          message: 'Please Enter a Valid Expiration Date'
      });
    }
  }

    const records = await Documents.findAll({ where: { LinkID: parseInt(linkid) },order: [['CreatedDate', 'DESC']] });
    const record = records[0]; // Get the most recent record for the given LinkID
    await db.Documents.update({ Active: false }, { where: { LinkID: parseInt(linkid) } }); // Marks all records as inactive
    //marks all records as inactive
    if (!records || records.length === 0) {
      return res.json({
        status: false,
        message: 'No records found for the given LinkID.'
      });
    
    }

    // Helper function to parse date or return null
    const parseDate = (dateStr) => {
      if (!dateStr) return null;
      const parsed = new Date(dateStr);
      return isNaN(parsed.getTime()) ? null : parsed;
    };

    // Calculate page count for new document
    const documentBuffer = buffer ? buffer : record.DataImage;
    const mimeType = req.file ? req.file.mimetype : (record.DataType ? `application/${record.DataType}` : 'application/octet-stream');
    const pageCount = await calculatePageCount(documentBuffer, mimeType);

    // Update record
    await record.update({
      Active:false
    });

    //create a new document
    const newdoc=await db.Documents.create(
      {
      LinkID: record.LinkID,
      Createdby: req.user.userName,
      CreatedDate: new Date(),
      DataImage:buffer?buffer:record.DataImage,
      DataType: req.file ? req.file.mimetype?(req.file.mimetype.split("/")[1]):"" : record.DataType,
      Active: true,
       DepartmentId: parseInt(dep),
      SubDepartmentId: parseInt(subdep),
      // Add the fields that are being updated
      FileName: filename,
      FileDate: parseDate(filedate),
      Text1: Text1,
      Date1: parseDate(Date1),
      Text2: Text2,
      Date2: parseDate(Date2),
      Text3: Text3,
      Date3: parseDate(Date3),
      Text4: Text4,
      publishing_status:publishing_status,
      Date4: parseDate(Date4),
      Text5: Text5,
      Date5: parseDate(Date5),
      Text6: Text6,
      Date6: parseDate(Date6),
      Text7: Text7,
      Date7: parseDate(Date7),
      Text8: Text8,
      Date8: parseDate(Date8),
      Text9: Text9,
      Date9: parseDate(Date9),
      Text10: Text10,
      Date10: parseDate(Date10),
      Expiration: expirationChecked,
      Confidential: confidentialChecked,
      ...(expirationChecked&&{ExpirationDate:new Date(expdate)}),
      PageCount: pageCount,
      Remarks: remarks,
      FileDescription,
      Description
    }
    )



    let versionNumber =`v`+1;
    prevVersion = await db.DocumentVersions.findOne({
      where: { DocumentID: record.ID, IsCurrentVersion: true }
    });
    if (prevVersion) {
      // Mark previous version as not current
      await prevVersion.update({ IsCurrentVersion: false,Active:false });
      // Extract version number from previous version
      const versionMatch = prevVersion.VersionNumber.match(/v(\d+)/);
      if (versionMatch) {
        versionNumber = `v${parseInt(versionMatch[1]) + 1}`;
      }
    }
    console.log('Version Number:', versionNumber);
    await db.DocumentVersions.create({
      LinkID: record.LinkID,
      DocumentID: newdoc.ID,
      VersionNumber: versionNumber,
      ModificationDate: new Date(),
      ModifiedBy: req.user.userName,
      Changes: {
        FileName: filename,
        FileDate: filedate,
        Text1, Date1, Text2, Date2, Text3, Date3,
        Text4, Date4, Text5, Date5, Text6, Date6,
        Text7, Date7, Text8, Date8, Text9, Date9,
        Text10, Date10,
        Expiration: expirationChecked,
        Confidential: confidentialChecked,
        ExpirationDate: expdate,
        Remarks: remarks
      },
      DataImage: record.DataImage,
      IsCurrentVersion: true,
      Active: true,
      FileDescription,
      Description
    });
      const smalldocwithoutfilebuffer=JSON.parse(JSON.stringify(newdoc))
      delete smalldocwithoutfilebuffer.DataImage
    await logAuditTrail(record.ID, 'UPDATED', req.user.id, record, JSON.stringify(smalldocwithoutfilebuffer), req, linkid);
    await logCollaboratorActivity(newdoc.ID, req.user.id, 'DOCUMENT_EDITED', req,JSON.stringify(smalldocwithoutfilebuffer), linkid);
   return res.json({
      status: true,
      message: 'Document updated successfully.',
   });
  } catch (error) {
    console.error('Error updating document:', error);
   return res.json({
      status: false,  
      message: `An error occurred while updating the document: ${error.message}`
    });
  }
});
router.post('/edit', upload.single('file'), requireAuth, async (req, res) => {
  try {
    // ============================================
    // 🚀 NEW VERSIONING CODE - IF YOU SEE THIS, NEW CODE IS RUNNING
    // ============================================
    console.log('🚀🚀🚀 [NEW EDIT ENDPOINT] Request received - NEW VERSIONING CODE ACTIVE 🚀🚀🚀');
    console.log('🚀 [EDIT ENDPOINT] req.body keys:', Object.keys(req.body));
    
    // Safely log req.body (avoid circular references and buffers)
    const safeBody = {};
    Object.keys(req.body).forEach(key => {
      const value = req.body[key];
      if (Buffer.isBuffer(value)) {
        safeBody[key] = `[Buffer ${value.length} bytes]`;
      } else if (typeof value === 'object' && value !== null) {
        try {
          safeBody[key] = JSON.stringify(value);
        } catch (e) {
          safeBody[key] = '[Object]';
        }
      } else {
        safeBody[key] = value;
      }
    });
    console.log('🚀 [EDIT ENDPOINT] req.body (safe):', JSON.stringify(safeBody, null, 2));
    
    const { id,dataImage } = req.body;
    const userId = req.user.id;
    
    // Validate required id field
    if (!id) {
      return res.json({
        status: false,
        message: 'Document ID is required'
      });
    }

    const buffer = req.file ? req.file.buffer : null;
    
    const document = await db.Documents.findByPk(id);
    if (!document) {
      return res.json({
        status: false,
        message: 'Document not found'
      });
    }
    
    const linkid = document.LinkID;
    const departmentId = document.DepartmentId;
    const subDepartmentId = document.SubDepartmentId;
    
    // Check if user has Edit permission
    const hasEditPermission = await checkUserPermission(
      userId, 
      departmentId, 
      subDepartmentId, 
      'Edit'
    );
    
    if (!hasEditPermission) {
      return res.status(403).json({
        status: false,
        message: 'You do not have permission to edit documents in this department and document type'
      });
    }

    // Extract optional fields with fallback to existing values
    const {
      filename, filedate, Text1, Date1, Text2, Date2, Text3, Date3,
      Text4, Date4, Text5, Date5, Text6, Date6, Text7, Date7,
      Text8, Date8, Text9, Date9, Text10, Date10,
      expiration, confidential, expdate, remarks, dep, subdep,
      publishing_status, FileDescription, Description,
      isMinorVersion, finalize
    } = req.body;

    // DEBUG: Log raw values received from request
    console.log('🔍 [VERSION DEBUG] Raw flags received:');
    console.log('  - isMinorVersion (raw):', isMinorVersion, '(type:', typeof isMinorVersion, ')');
    console.log('  - finalize (raw):', finalize, '(type:', typeof finalize, ')');
    console.log('  - req.body keys:', Object.keys(req.body).filter(k => k === 'isMinorVersion' || k === 'finalize'));

    // Extract and normalize version flags
    // Handle both string and boolean values from FormData
    // FormData sends strings, so "true" string should be converted to boolean
    // Important: Only treat as true if explicitly "true", otherwise false
    const isMinorVersionFlag = (
      isMinorVersion !== undefined &&
      isMinorVersion !== null &&
      (
        isMinorVersion === 'true' || 
        isMinorVersion === true || 
        String(isMinorVersion).toLowerCase() === 'true'
      )
    );
    const finalizeFlag = (
      finalize !== undefined &&
      finalize !== null &&
      (
        finalize === 'true' || 
        finalize === true || 
        String(finalize).toLowerCase() === 'true'
      )
    );

    // DEBUG: Log normalized flags
    console.log('🔍 [VERSION DEBUG] Normalized flags:');
    console.log('  - isMinorVersionFlag:', isMinorVersionFlag, '(boolean)');
    console.log('  - finalizeFlag:', finalizeFlag, '(boolean)');

    // Handle expiration validation only if expiration is provided
    if (expiration === 'true' && expdate) {
      const parsedExpDate = new Date(expdate);
      if (isNaN(parsedExpDate.getTime()) || parsedExpDate <= new Date()) {
        return res.json({
          status: false,
          message: 'Please Enter a Valid Expiration Date'
        });
      }
    }

    const records = await Documents.findAll({ 
      where: { LinkID: parseInt(linkid) },
      order: [['CreatedDate', 'DESC']] 
    });
    
    const record = records[0]; // Get the most recent record for the given LinkID
    
    if (!records || records.length === 0) {
      return res.json({
        status: false,
        message: 'No records found for the given LinkID.'
      });
    }

    // Mark all records as inactive
    await db.Documents.update({ Active: false }, { where: { LinkID: parseInt(linkid) } });

    // Helper function to parse date or return existing value
    const parseDate = (dateStr, existingValue) => {
      if (dateStr === undefined || dateStr === null) return existingValue;
      if (!dateStr) return null;
      const parsed = new Date(dateStr);
      return isNaN(parsed.getTime()) ? existingValue : parsed;
    };

    // Helper function to get value or existing value
    const getValue = (newValue, existingValue) => {
      return newValue !== undefined ? newValue : existingValue;
    };

    // Update record
    await record.update({
      Active: false
    });

    // Build update object with only provided fields
    const updateData = {
      LinkID: record.LinkID,
      Createdby: req.user.userName,
      CreatedDate: new Date(),
      // DataImage: buffer ? buffer : record.DataImage,
      DataImage: dataImage ? dataImage : record.DataImage,
      DataType: req.file ? (req.file.mimetype ? req.file.mimetype.split("/")[1] : "") : record.DataType,
      Active: true,
      DepartmentId: dep !== undefined ? parseInt(dep) : record.DepartmentId,
      SubDepartmentId: subdep !== undefined ? parseInt(subdep) : record.SubDepartmentId,
      FileName: getValue(filename, record.FileName),
      FileDate: parseDate(filedate, record.FileDate),
      Text1: getValue(Text1, record.Text1),
      Date1: parseDate(Date1, record.Date1),
      Text2: getValue(Text2, record.Text2),
      Date2: parseDate(Date2, record.Date2),
      Text3: getValue(Text3, record.Text3),
      Date3: parseDate(Date3, record.Date3),
      Text4: getValue(Text4, record.Text4),
      Date4: parseDate(Date4, record.Date4),
      Text5: getValue(Text5, record.Text5),
      Date5: parseDate(Date5, record.Date5),
      Text6: getValue(Text6, record.Text6),
      Date6: parseDate(Date6, record.Date6),
      Text7: getValue(Text7, record.Text7),
      Date7: parseDate(Date7, record.Date7),
      Text8: getValue(Text8, record.Text8),
      Date8: parseDate(Date8, record.Date8),
      Text9: getValue(Text9, record.Text9),
      Date9: parseDate(Date9, record.Date9),
      Text10: getValue(Text10, record.Text10),
      Date10: parseDate(Date10, record.Date10),
      publishing_status: getValue(publishing_status, record.publishing_status),
      Expiration: expiration !== undefined ? expiration === 'true' : record.Expiration,
      Confidential: confidential !== undefined ? confidential === 'true' : record.Confidential,
      Remarks: getValue(remarks, record.Remarks),
      FileDescription: getValue(FileDescription, record.FileDescription),
      Description: getValue(Description, record.Description)
    };

    // Add expiration date only if expiration is enabled and date is provided
    if (updateData.Expiration && expdate) {
      updateData.ExpirationDate = new Date(expdate);
    } else if (record.ExpirationDate) {
      updateData.ExpirationDate = record.ExpirationDate;
    }

    // Create new document
    const newdoc = await db.Documents.create(updateData);

    // Handle versioning with minor/major version support
    let versionNumber = `v1`; // Default for first version
    // Find current version by LinkID (more reliable than DocumentID)
    // Note: LinkID might be stored as string or number, so try both
    const linkidStr = String(linkid);
    const linkidNum = parseInt(linkid);
    
    console.log('🔍 [VERSION DEBUG] LinkID types:', {
      original: linkid,
      type: typeof linkid,
      asString: linkidStr,
      asNumber: linkidNum
    });
    
    // Try to find version by LinkID (try both string and number)
    let prevVersion = await db.DocumentVersions.findOne({
      where: { LinkID: linkidStr, IsCurrentVersion: true },
      order: [['ModificationDate', 'DESC']]
    });
    
    // If not found, try with number
    if (!prevVersion && !isNaN(linkidNum)) {
      prevVersion = await db.DocumentVersions.findOne({
        where: { LinkID: linkidNum, IsCurrentVersion: true },
        order: [['ModificationDate', 'DESC']]
      });
    }
    
    // DEBUG: Log previous version info
    console.log('🔍 [VERSION DEBUG] Previous version lookup:');
    console.log('  - LinkID:', linkid);
    console.log('  - Previous version found:', prevVersion ? 'YES' : 'NO');
    if (prevVersion) {
      console.log('  - Previous version number:', prevVersion.VersionNumber);
    }
    
    if (prevVersion) {
      // Mark previous version as not current
      await prevVersion.update({ IsCurrentVersion: false, Active: false });
      
      // DEBUG: Log before version calculation
      console.log('🔍 [VERSION DEBUG] Calculating new version:');
      console.log('  - Current version:', prevVersion.VersionNumber);
      console.log('  - isMinorVersionFlag:', isMinorVersionFlag);
      console.log('  - finalizeFlag:', finalizeFlag);
      
      // Calculate new version using helper function
      versionNumber = incrementVersion(
        prevVersion.VersionNumber,
        isMinorVersionFlag,
        finalizeFlag
      );
      
      // DEBUG: Log after version calculation
      console.log('🔍 [VERSION DEBUG] Calculated new version:', versionNumber);
    } else {
      // No previous version found, but flags might be set
      // If finalize is true on first version, create v2
      if (finalizeFlag) {
        versionNumber = `v2`;
        console.log('🔍 [VERSION DEBUG] No previous version, but finalize=true, creating v2');
      } else {
        console.log('🔍 [VERSION DEBUG] No previous version, creating v1 (first version)');
      }
    }

    console.log('✅ [VERSION RESULT] Final version:', versionNumber, '| isMinorVersion:', isMinorVersionFlag, '| finalize:', finalizeFlag);
    console.log('✅ [VERSION RESULT] ============================================');

    // Build changes object with only the fields that were actually provided
    const changes = {};
    if (filename !== undefined) changes.FileName = filename;
    if (filedate !== undefined) changes.FileDate = filedate;
    if (Text1 !== undefined) changes.Text1 = Text1;
    if (Date1 !== undefined) changes.Date1 = Date1;
    if (Text2 !== undefined) changes.Text2 = Text2;
    if (Date2 !== undefined) changes.Date2 = Date2;
    if (Text3 !== undefined) changes.Text3 = Text3;
    if (Date3 !== undefined) changes.Date3 = Date3;
    if (Text4 !== undefined) changes.Text4 = Text4;
    if (Date4 !== undefined) changes.Date4 = Date4;
    if (Text5 !== undefined) changes.Text5 = Text5;
    if (Date5 !== undefined) changes.Date5 = Date5;
    if (Text6 !== undefined) changes.Text6 = Text6;
    if (Date6 !== undefined) changes.Date6 = Date6;
    if (Text7 !== undefined) changes.Text7 = Text7;
    if (Date7 !== undefined) changes.Date7 = Date7;
    if (Text8 !== undefined) changes.Text8 = Text8;
    if (Date8 !== undefined) changes.Date8 = Date8;
    if (Text9 !== undefined) changes.Text9 = Text9;
    if (Date9 !== undefined) changes.Date9 = Date9;
    if (Text10 !== undefined) changes.Text10 = Text10;
    if (Date10 !== undefined) changes.Date10 = Date10;
    if (expiration !== undefined) changes.Expiration = expiration === 'true';
    if (confidential !== undefined) changes.Confidential = confidential === 'true';
    if (expdate !== undefined) changes.ExpirationDate = expdate;
    if (remarks !== undefined) changes.Remarks = remarks;
    if (publishing_status !== undefined) changes.publishing_status = publishing_status;
    if (FileDescription !== undefined) changes.FileDescription = FileDescription;
    if (Description !== undefined) changes.Description = Description;

    // DEBUG: Log before creating version record
    console.log('🔍 [VERSION DEBUG] Creating version record:');
    console.log('  - LinkID:', record.LinkID);
    console.log('  - DocumentID:', newdoc.ID);
    console.log('  - VersionNumber:', versionNumber);
    
    const versionRecord = await db.DocumentVersions.create({
      LinkID: record.LinkID,
      DocumentID: newdoc.ID,
      VersionNumber: versionNumber,
      ModificationDate: new Date(),
      ModifiedBy: req.user.userName,
      Changes: changes,
      DataImage: record.DataImage,
      IsCurrentVersion: true,
      Active: true,
      FileDescription: getValue(FileDescription, record.FileDescription),
      Description: getValue(Description, record.Description)
    });
    
    console.log('✅ [VERSION DEBUG] Version record created:', {
      ID: versionRecord.ID,
      VersionNumber: versionRecord.VersionNumber,
      IsCurrentVersion: versionRecord.IsCurrentVersion
    });

    const smalldocwithoutfilebuffer = JSON.parse(JSON.stringify(newdoc));
    delete smalldocwithoutfilebuffer.DataImage;
    
    await logAuditTrail(record.ID, 'UPDATED', req.user.id, record, JSON.stringify(smalldocwithoutfilebuffer), req, linkid);
    await logCollaboratorActivity(newdoc.ID, req.user.id, 'DOCUMENT_EDITED', req, JSON.stringify(smalldocwithoutfilebuffer), linkid);
    
    return res.json({
      status: true,
      message: 'Document updated successfully.',
    });
  } catch (error) {
    console.error('Error updating document:', error);
    return res.json({
      status: false,
      message: `An error occurred while updating the document: ${error.message}`
    });
  }
});




router.post('/create',requireAuth,upload.single('file'), async (req, res) => {
  // This is identical to the edit POST route in the original controller
  // You may want to modify this to actually create new documents
  try {
    const userId = req.user.id;
    const {
       Text1, Date1, Text2, Date2, Text3, Date3,
      Text4, Date4, Text5, Date5, Text6, Date6, Text7, Date7,
      Text8, Date8, Text9, Date9, Text10, Date10,
      expiration, confidential, expdate, remarks, id, dep, subdep, publishing_status,FileDescription,
      Description,filename
    } = req.body;
    
    // Validate required fields
    if (!dep || !subdep) {
      return res.json({
        status: false,
        message: 'Department and SubDepartment are required'
      });
    }
    
    const departmentId = parseInt(dep);
    const subDepartmentId = parseInt(subdep);
    
    // Check if user has Add permission
    const hasAddPermission = await checkUserPermission(
      userId, 
      departmentId, 
      subDepartmentId, 
      'Add'
    );
    
    if (!hasAddPermission) {
      return res.status(403).json({
        status: false,
        message: 'You do not have permission to upload documents in this department and document type'
      });
    }
    // const filename= req.file ? req.file.originalname : "";
    const buffer = req.file ? req.file.buffer : null;
    const filedate= req.file ? new Date() : new Date();
    const expirationChecked = expiration === 'true';
    const confidentialChecked = confidential === 'true';
    const linkid=generateLinkID();
    console.log("buffer",buffer)
    if (!buffer) {
      return res.json({
            status:false,
            message: 'Please Attache a Valid File'
        });
    }
    // Validate expiration date
    if (expirationChecked) {
      const parsedExpDate = new Date(expdate);
      if (isNaN(parsedExpDate.getTime()) || parsedExpDate <= new Date()) {
       
        return res.json({
            status:false,
            message: 'Please Enter a Valid Expiration Date'
        });
      }
    }

    // Helper function to parse date or return null
    const parseDate = (dateStr) => {
      if (!dateStr) return null;
      const parsed = new Date(dateStr);
      return isNaN(parsed.getTime()) ? null : parsed;
    };
    const newexpdate=expdate?expdate:new Date()+ 8541*30*24*60*60*1000
    
    // Calculate page count
    const mimeType = req.file ? req.file.mimetype : 'application/octet-stream';
    const pageCount = await calculatePageCount(buffer, mimeType);
    
    // Create new document
    const newDocument = await Documents.create({
      DepartmentId: parseInt(dep),
      SubDepartmentId: parseInt(subdep),
      LinkID: linkid,
      FileName: filename,
      DataImage: buffer,
      FileDate: parseDate(filedate),
      Text1: Text1,
      Date1: parseDate(Date1),
      Text2: Text2,
      Date2: parseDate(Date2),
      Text3: Text3,
      Date3: parseDate(Date3),
      Text4: Text4,
      Date4: parseDate(Date4),
      Text5: Text5,
      Date5: parseDate(Date5),
      Text6: Text6,
      Date6: parseDate(Date6),
      Text7: Text7,
      Date7: parseDate(Date7),
      Text8: Text8,
      Date8: parseDate(Date8),
      Text9: Text9,
      Date9: parseDate(Date9),
      Text10: Text10,
      Date10: parseDate(Date10),
      Expiration: expirationChecked,
      Confidential: confidentialChecked,
      ExpirationDate: new Date(newexpdate),
      Remarks: remarks,
      publishing_status:publishing_status,
      Active: true,
      DataType: req.file ? req.file.mimetype?(req.file.mimetype.split("/")[1]):"" : 'octet-stream',
      PageCount: pageCount,
      FileDescription,
      Description
    });

     const collabarator=await db.DocumentCollaborations.create({
      DocumentID: newDocument.ID,
      CollaboratorID: req.user.id,
      LinkID:linkid,
      CollaboratorName: req.user.userName,
      PermissionLevel: 'ADMIN',
      AddedBy: req.user.id,
      AddedDate: new Date(),
      Active: true
    });
console.log("req.user",req.user)
      const smalldocwithoutfilebuffer=JSON.parse(JSON.stringify(newDocument))
      delete smalldocwithoutfilebuffer.DataImage
     await db.CollaboratorActivities.create({
      DocumentID: newDocument.ID,
      LinkID:linkid,
      CollaboratorID: req.user.id,
      DocumentCollaborationID:collabarator.ID,
      ActivityType: 'DOCUMENT_OPENED',
      ActivityDate: new Date(),
      ActivityDetails: JSON.stringify(smalldocwithoutfilebuffer),
      IPAddress: req?.ip,
      DeviceInfo: req?.get('User-Agent')
    });


    await db.DocumentVersions.create({
      DocumentID: newDocument.ID,
      LinkID:newDocument.LinkID,
      VersionNumber: 'v1',
      ModificationDate: new Date(),
      ModifiedBy: req.user.id,
      Changes: 'Initial version',
      DataImage: newDocument.DataImage,
      IsCurrentVersion: true,
      Active: true
    });
    await logAuditTrail(newDocument.ID, 'CREATED', req.user.id, null, smalldocwithoutfilebuffer, req, linkid);
    // await logCollaboratorActivity(newDocument.ID, req.user.id, 'DOCUMENT_CREATED', req, linkid);
    //deativate all docs but current doc
    await db.Documents.update({ Active: false }, { where: { LinkID: newDocument.LinkID, ID: { [Op.ne]: newDocument.ID } } });
    res.json({
        status: true,
        message: 'Document created successfully.',
    });
  } catch (error) {
    console.error('Error creating document:', error);
   
    res.json({
        status: false,
        message: `An error occurred while creating the document: ${error.message}`
    });
  }
});
router.delete('/delete/:documentID',requireAuth, async (req, res) => {
  try {
    const { documentID } = req.params;
    const userId = req.user.id;
    
    const documentbypk = await db.Documents.findByPk(documentID);
    if (!documentbypk) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }
    
    const linkid = documentbypk.LinkID;
    const departmentId = documentbypk.DepartmentId;
    const subDepartmentId = documentbypk.SubDepartmentId;
    
    // Check if user has Delete permission
    const hasDeletePermission = await checkUserPermission(
      userId, 
      departmentId, 
      subDepartmentId, 
      'Delete'
    );
    
    if (!hasDeletePermission) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to delete documents in this department and document type'
      });
    }

    // Soft delete: Set Active = false
    await db.Documents.update(
      { Active: false },
      { where: { LinkID: linkid } }
    );

    await logAuditTrail(documentID, 'DOCUMENT_REMOVED', userId, "deleted", null, req, linkid);

    res.status(200).json({
      success: true,
      message: 'document removed successfully'
    });

  } catch (error) {
    console.error('Error removing document:', error);
    res.status(500).json({
      success: false,
      message: 'Error removing document',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

router.post('/upload-files', upload.array('attach_files'), async (req, res) => {
  try {
    const { attachmentIDs,DataType } = req.body;
    const files = req.files;

    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded.' });
    }

    if (!attachmentIDs || parseInt(attachmentIDs) === 0) {
      return res.status(400).json({ error: 'Invalid LinkID.' });
    }

    for (const file of files) {
      if (file.buffer.length > 0) {
        // console.log("file", file,file.buffer)
        const fileExtension = path.extname(file.originalname).toLowerCase();

        await db.Attachment.create({
          LinkID: parseInt(attachmentIDs),
          DataImage: file.buffer,
          DataName: file.originalname,
          DataType: DataType
        });
      }
    }

    res.json({ message: 'Files uploaded successfully!' });
  } catch (error) {
    console.error('Error uploading files:', error);
    res.status(500).json({ error: 'An error occurred while saving the data.' });
  }
});

router.post('/delete-attachment', async (req, res) => {
  try {
    const { attachmentID } = req.body;

    if (!attachmentID || parseInt(attachmentID) === 0) {
      return res.status(400).json({ error: 'Invalid attachment ID.' });
    }

    const attachment = await db.Attachment.findByPk(parseInt(attachmentID));
    if (!attachment) {
      return res.status(404).json({ error: 'Attachment not found.' });
    }

    await attachment.destroy();
    res.json({ message: 'Attachment deleted successfully!' });
  } catch (error) {
    console.error('Error deleting attachment:', error);
    res.status(500).json({ error: 'An error occurred while deleting the attachment.' });
  }
});

router.get('/get-attachments/:attachmentIDs', async (req, res) => {
  try {
    const { attachmentIDs } = req.params;
    
    const attachments = await db.Attachment.findAll({
      where: { LinkID: parseInt(attachmentIDs) },
      
    });

    const formattedAttachments = attachments.map(a => ({
      id: a.ID,
      dataName: a.DataName,
      dataType: a.DataType,
      LinkID:a.LinkID
    }));

    res.json(formattedAttachments);
  } catch (error) {
    console.error('Error getting attachments:', error);
    res.status(500).json({ error: 'An error occurred while fetching attachments.' });
  }
});

/**
 * Helper function to find Ghostscript executable path
 * Supports Windows, Linux, and macOS
 */
function getGhostscriptPath() {
  // Check if path is provided via environment variable
  if (process.env.GHOSTSCRIPT_PATH && fs.existsSync(process.env.GHOSTSCRIPT_PATH)) {
    return process.env.GHOSTSCRIPT_PATH;
  }

  // Platform-specific default paths
  const platform = process.platform;
  const possiblePaths = [];

  if (platform === 'win32') {
    // Windows paths (checking newer versions first)
    possiblePaths.push(
      'C:\\Program Files\\gs\\gs10.06.0\\bin\\gswin64c.exe',
      'C:\\Program Files (x86)\\gs\\gs10.06.0\\bin\\gswin32c.exe',
      'C:\\Program Files\\gs\\gs10.04.0\\bin\\gswin64c.exe',
      'C:\\Program Files (x86)\\gs\\gs10.04.0\\bin\\gswin32c.exe',
      'C:\\Program Files\\gs\\gs10.03.0\\bin\\gswin64c.exe',
      'C:\\Program Files (x86)\\gs\\gs10.03.0\\bin\\gswin32c.exe',
      'C:\\Program Files\\gs\\gs10.02.0\\bin\\gswin64c.exe',
      'C:\\Program Files (x86)\\gs\\gs10.02.0\\bin\\gswin32c.exe'
    );
  } else if (platform === 'linux' || platform === 'darwin') {
    // Linux and macOS paths
    possiblePaths.push(
      '/usr/bin/gs',
      '/usr/local/bin/gs',
      '/opt/homebrew/bin/gs' // macOS with Homebrew on Apple Silicon
    );
  }

  // Find the first existing path
  for (const gsPath of possiblePaths) {
    if (fs.existsSync(gsPath)) {
      return gsPath;
    }
  }

  return null;
}

/**
 * Helper function to convert PDF buffer to PDF/A format
 * @param {Buffer} pdfBuffer - The PDF file buffer
 * @param {string} originalFileName - Original filename for naming output
 * @returns {Promise<{buffer: Buffer, fileName: string}>} - PDF/A buffer and filename
 */
function convertToPdfA(pdfBuffer, originalFileName = 'document.pdf') {
  return new Promise((resolve, reject) => {
    const ghostscriptPath = getGhostscriptPath();
    
    if (!ghostscriptPath) {
      return reject(new Error('Ghostscript is not installed or not found. Please install Ghostscript or set GHOSTSCRIPT_PATH environment variable.'));
    }

    // Create temporary files
    const tempDir = path.join(__dirname, '../temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const timestamp = Date.now();
    const tempInputPath = path.join(tempDir, `input_${timestamp}.pdf`);
    const tempOutputPath = path.join(tempDir, `output_${timestamp}.pdf`);

    try {
      // Write input file
      fs.writeFileSync(tempInputPath, pdfBuffer);

      // Ghostscript arguments for PDF/A conversion
      const args = [
        '-dPDFA=1',
        '-dPDFACompatibilityPolicy=1',
        '-dCompatibilityLevel=1.4',
        '-sDEVICE=pdfwrite',
        '-dBATCH',
        '-dNOPAUSE',
        '-sColorConversionStrategy=UseDeviceIndependentColor',
        '-dPDFSETTINGS=/default',
        '-dNOOUTERSAVE',
        '-dNOSAFER',
        `-sOutputFile=${tempOutputPath}`,
        tempInputPath
      ];

      const ghostscript = spawn(ghostscriptPath, args);
      let errorOutput = '';

      ghostscript.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      ghostscript.on('close', (code) => {
        try {
          // Cleanup input file
          if (fs.existsSync(tempInputPath)) {
            fs.unlinkSync(tempInputPath);
          }

          if (code !== 0 || !fs.existsSync(tempOutputPath)) {
            const error = errorOutput || `Ghostscript failed with exit code ${code}`;
            console.error('PDF/A conversion error:', error);
            return reject(new Error(`PDF/A conversion failed: ${error}`));
          }

          const convertedBytes = fs.readFileSync(tempOutputPath);
          const baseName = path.parse(originalFileName).name;
          const fileName = `${baseName}_PDFA.pdf`;

          // Cleanup output file
          if (fs.existsSync(tempOutputPath)) {
            fs.unlinkSync(tempOutputPath);
          }

          resolve({
            buffer: convertedBytes,
            fileName: fileName
          });
        } catch (error) {
          // Cleanup on error
          if (fs.existsSync(tempInputPath)) fs.unlinkSync(tempInputPath);
          if (fs.existsSync(tempOutputPath)) fs.unlinkSync(tempOutputPath);
          reject(error);
        }
      });

      ghostscript.on('error', (error) => {
        // Cleanup on error
        if (fs.existsSync(tempInputPath)) fs.unlinkSync(tempInputPath);
        if (fs.existsSync(tempOutputPath)) fs.unlinkSync(tempOutputPath);
        console.error('Ghostscript spawn error:', error);
        reject(new Error(`Failed to execute Ghostscript: ${error.message}`));
      });

    } catch (error) {
      // Cleanup on error
      if (fs.existsSync(tempInputPath)) fs.unlinkSync(tempInputPath);
      if (fs.existsSync(tempOutputPath)) fs.unlinkSync(tempOutputPath);
      reject(error);
    }
  });
}

// Legacy endpoint for attachments (keeping for backward compatibility)
router.get('/convert-to-pdfa/:attachmentID', async (req, res) => {
  try {
    const { attachmentID } = req.params;
    
    const attachment = await db.Attachment.findByPk(parseInt(attachmentID));
    if (!attachment || !attachment.DataImage) {
      return res.status(404).json({ 
        error: 'Attachment not found or invalid.',
        success: false 
      });
    }

    const result = await convertToPdfA(attachment.DataImage, attachment.DataName || 'document.pdf');
    
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${result.fileName}"`
    });
    res.send(result.buffer);
  } catch (error) {
    console.error('Error converting to PDF/A:', error);
    res.status(500).json({ 
      error: error.message || 'PDF/A conversion failed',
      success: false 
    });
  }
});

/**
 * POST /documents/convert-to-pdfa
 * Converts a PDF file to PDF/A format
 * Request: multipart/form-data with 'file' field and optional 'documentId'
 * Response: PDF/A compliant PDF file
 */
router.post('/convert-to-pdfa', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        error: 'No file provided. Please upload a PDF file.',
        success: false 
      });
    }

    // Check if file is a PDF
    const fileMimeType = req.file.mimetype || '';
    const isPdf = fileMimeType === 'application/pdf' || 
                  req.file.originalname.toLowerCase().endsWith('.pdf');
    
    if (!isPdf) {
      return res.status(400).json({ 
        error: 'File must be a PDF document.',
        success: false 
      });
    }

    const documentId = req.body.documentId ? parseInt(req.body.documentId) : null;
    const originalFileName = req.file.originalname || 'document.pdf';

    // Convert to PDF/A
    const result = await convertToPdfA(req.file.buffer, originalFileName);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${result.fileName}"`
    });
    res.send(result.buffer);

  } catch (error) {
    console.error('Error converting to PDF/A:', error);
    res.status(500).json({ 
      error: error.message || 'PDF/A conversion failed',
      success: false 
    });
  }
});

/**
 * GET /documents/:documentId/convert-to-pdfa
 * Converts a document from database to PDF/A format
 * Request: documentId as path parameter
 * Response: PDF/A compliant PDF file
 */
router.get('/documents/:documentId/convert-to-pdfa', async (req, res) => {
  try {
    const { documentId } = req.params;
    
    if (!documentId || isNaN(parseInt(documentId))) {
      return res.status(400).json({ 
        error: 'Invalid document ID.',
        success: false 
      });
    }

    // Fetch document from database
    const document = await Documents.findOne({
      where: { 
        ID: parseInt(documentId),
        Active: true
      }
    });

    if (!document || !document.DataImage) {
      return res.status(404).json({ 
        error: 'Document not found or has no file data.',
        success: false 
      });
    }

    // Check if document is a PDF
    const isPdf = (document.DataType === '.pdf' || 
                   document.DataType === 'pdf' ||
                   (document.FileName && document.FileName.toLowerCase().endsWith('.pdf')));

    if (!isPdf) {
      return res.status(400).json({ 
        error: 'Document is not a PDF file. PDF/A conversion only works for PDF documents.',
        success: false 
      });
    }

    const originalFileName = document.FileName || document.DataName || 'document.pdf';

    // Convert to PDF/A
    const result = await convertToPdfA(document.DataImage, originalFileName);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${result.fileName}"`
    });
    res.send(result.buffer);

  } catch (error) {
    console.error('Error converting to PDF/A:', error);
    res.status(500).json({ 
      error: error.message || 'PDF/A conversion failed',
      success: false 
    });
  }
});





router.get('/documents/:userid', async (req, res) => {
  try {
    const { userId, page = 1, limit = 10, search = '', status = 'all' } = req.query;
    const {userid}=req.params
    // ⚡ FIX: Ensure limit and page are properly parsed as integers
    const parsedLimit = parseInt(limit, 10) || 10;
    const parsedPage = parseInt(page, 10) || 1;
    const offset = (parsedPage - 1) * parsedLimit;

    let whereClause = { Active: true };
    
    if (search) {
      whereClause[Op.or] = [
        { DataName: { [Op.like]: `%${search}%` } },
        { FileName: { [Op.like]: `%${search}%` } },
        { Remarks: { [Op.like]: `%${search}%` } }
      ];
    }
    
    // ⚡ OPTIMIZATION: Parallelize independent queries
    const [restrictions, user, approvers, documents] = await Promise.all([
      db.DocumentRestrictions.findAll({
        where: { UserID: userid },
        raw: true
      }),
      db.Users.findOne({
        where: { ID: userid },
        attributes: ['ID', 'userAccessArray'] // Only fetch needed fields
      }),
      db.DocumentApprovers.findAll({ raw: true }),
      db.Documents.findAndCountAll({
        where: whereClause,
        attributes: {
          exclude: ['DataImage'] // Skip BLOB data
        },
        limit: parsedLimit,
        offset: offset,
        order: [['CreatedDate', 'DESC']]
      })
    ]);
    
    let userAccess = [];
    try {
      userAccess = user?.userAccessArray ? JSON.parse(user.userAccessArray) : [];
    } catch(e) {}
    
    const restrictionIds = restrictions.map(r => r.DocumentID);
    
    // ⚡ OPTIMIZATION: Simplified and faster - use IsCurrentVersion flag if available
    const linkIds = documents.rows.map(doc => String(doc.LinkID));
    
    // ⚡ OPTIMIZATION: Fetch only current versions first (fastest), fallback to latest if needed
    const [currentVersions, allApprovals] = await Promise.all([
      linkIds.length > 0 ? db.DocumentVersions.findAll({
        where: { 
          LinkID: { [Op.in]: linkIds },
          IsCurrentVersion: true
        },
        attributes: ['ID', 'LinkID', 'VersionNumber', 'ModificationDate', 'ModifiedBy', 'IsCurrentVersion'],
        raw: true
      }).catch(() => []) : [],
      
      linkIds.length > 0 ? db.DocumentApprovals.findAll({
        where: { 
          LinkID: { [Op.in]: linkIds },
          RequestedBy: userid
        },
        attributes: ['ID', 'LinkID', 'Status', 'RequestedDate'],
        order: [['RequestedDate', 'DESC']],
        raw: true,
        limit: 1000 // Limit to prevent huge queries
      }).catch(() => []) : []
    ]);
    
    // ⚡ OPTIMIZATION: If some documents don't have IsCurrentVersion, fetch latest for those
    const currentVersionLinkIds = new Set(currentVersions.map(v => String(v.LinkID)));
    const missingLinkIds = linkIds.filter(id => !currentVersionLinkIds.has(id));
    
    // ⚡ OPTIMIZATION: Filter latest versions to only one per LinkID (in memory, fast)
    let latestVersions = [];
    if (missingLinkIds.length > 0) {
      const allLatest = await db.DocumentVersions.findAll({
        where: { LinkID: { [Op.in]: missingLinkIds } },
        attributes: ['ID', 'LinkID', 'VersionNumber', 'ModificationDate', 'ModifiedBy', 'IsCurrentVersion'],
        order: [['ModificationDate', 'DESC']],
        raw: true
      }).catch(() => []);
      
      // Filter to only latest per LinkID (fast in-memory operation)
      const latestMap = {};
      allLatest.forEach(v => {
        const linkId = String(v.LinkID);
        if (!latestMap[linkId]) {
          latestMap[linkId] = v;
        }
      });
      latestVersions = Object.values(latestMap);
    }
    
    // Combine versions
    const allVersions = [...currentVersions, ...latestVersions];
    
    // ⚡ OPTIMIZATION: Create version map (already filtered)
    const versionMap = {};
    allVersions.forEach(version => {
      const linkId = String(version.LinkID);
      versionMap[linkId] = version;
    });
    
    // ⚡ OPTIMIZATION: Create approval map with latest approval per LinkID
    const approvalMap = {};
    allApprovals.forEach(approval => {
      const linkId = String(approval.LinkID);
      if (!approvalMap[linkId]) {
        approvalMap[linkId] = approval;
      }
    });
    
    // ⚡ OPTIMIZATION: Pre-create approver lookup map for O(1) access
    const approverMap = {};
    approvers.forEach(approver => {
      const key = `${approver.DepartmentId}_${approver.SubDepartmentId}`;
      if (!approverMap[key]) {
        approverMap[key] = approver;
      }
    });
    
    const newdocuments = documents.rows.map(doc => {
      const LinkID = String(doc.LinkID);
      const versions = versionMap[LinkID] || null;
      const approverKey = `${doc.DepartmentId}_${doc.SubDepartmentId}`;
      const doc_under_approvalof = approverMap[approverKey];
      const approval = approvalMap[LinkID];
      const shoulduserbeallowedtoapproverequest = doc_under_approvalof ? true : false;
      const isRestricted = restrictionIds.includes(doc.ID + "");
      const newdoc = JSON.parse(JSON.stringify(doc));
      newdoc.approval = approval;
      newdoc.approvalstatus = false;
      if(approval && approval.Status == "1") {
        newdoc.approvalstatus = true;
      }
      return {
        newdoc,
        isRestricted: isRestricted,
        versions: versions,
        restrictions: isRestricted ? restrictions.filter(r => r.DocumentID === doc.ID) : []
      };
    });
    
    res.status(200).json({
      success: true,
      data: {
        documents: newdocuments,
        pagination: {
          currentPage: parsedPage,
          totalPages: Math.ceil(documents.count / parsedLimit) || 1,
          totalItems: documents.count,
          itemsPerPage: parsedLimit
        }
      }
    });

  } catch (error) {
    console.error('Error fetching documents:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching documents',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

router.get('/alldocuments_old/:userid', async (req, res) => {
  try {
    const { userId, page = 1, limit = 10, search = '', status = 'all' } = req.query;
    const {userid}=req.params
    // ⚡ FIX: Ensure limit and page are properly parsed as integers
    const parsedLimit = parseInt(limit, 10) || 10;
    const parsedPage = parseInt(page, 10) || 1;
    const offset = (parsedPage - 1) * parsedLimit;

    let whereClause = { Active: true };
    
    if (search) {
      whereClause[Op.or] = [
        { DataName: { [Op.like]: `%${search}%` } },
        { FileName: { [Op.like]: `%${search}%` } },
        { Remarks: { [Op.like]: `%${search}%` } }
      ];
    }
    const restrictions=await db.DocumentRestrictions.findAll({
      where:{
        UserID:userid
      },
      raw:true
    })
    // console.log("restr",restrictions)
    const restrictionIds = restrictions.map(r => r.DocumentID);
    // console.log("restrictions",restrictions)
    const documents = await db.Documents.findAndCountAll({
      where: whereClause,
      limit: parsedLimit,
      offset: offset,
      order: [['CreatedDate', 'DESC']]
    });
    const OCRDocumentReadFields = await db.OCRDocumentReadFields.findAll({
     
      raw: true
    });
    const templatemodels=await db.Template.findAll({raw:true})
    const newdocuments = documents.rows.map(async doc => {
       const buffer = doc.DataImage; // e.g., from req.file.buffer or a DB BLOB
        // console.log("doc",doc)
        // Ensure the uploads/temp2 directory exists
        const dir = path.join(__dirname, `../public/images/redacteddocs/document_${doc.ID}`);
        const filepathrelativetoserver=`document_${doc.ID}`
        // const redacteddocspath=path.join(__dirname, `../public/images/redacteddocs`);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        await clearDirectory(dir)
    // Specify the file path and name
        const filePath = path.join(dir,'output.png');

        // Write the buffer to file
        fs.writeFile(filePath, buffer, (err) => {
          if (err) {
            console.error('Error saving file:', err);
          } else {
            console.log('File saved successfully at', filePath);
          }
        });
      const isRestricted = restrictionIds.includes(doc.ID+"");
      const template=OCRDocumentReadFields.find(field => field.LinkId === doc.LinkID);
      // console.log("template",template,"OCRDocumentReadFields",OCRDocumentReadFields, "doc.LinkID",doc.LinkID)
      const template_id = template ? template.template_id : null;
      let filepath='output.png';
      if(template_id){
        const templatemodel=templatemodels.find(t => t.ID == template_id);
        // console.log("templatemodel",templatemodel)
        const templatefields=templatemodel ? (templatemodel.fields?JSON.parse(templatemodel.fields):null) : [];
        // console.log("templatefields",templatefields)
        // const blurringregions=restrictions.filter(r => r.DocumentID === doc.ID && templatefields.includes(r.Field));
        const blurringregions=templatefields.filter(field => {
          return restrictions.some(r => r.DocumentID === doc.ID && r.Field === field.fieldName);
        });
        // const redacteddocspath=path.join(__dirname, `../public/images/redacteddocs`);
        let imageBuffer=doc.DataImage
        // console.log("redacteddocspath",dir)
         if (doc.DataType === '.pdf'||doc.DataType === 'pdf') {
                // For PDF files, you'd need to convert to image first
                // This is a simplified example - you might want to use pdf2pic or similar
        const imagebuffer=await convertPdfBufferToImages(doc.DataImage, path.join(__dirname,"/uploads/temp"));
          // console.log("imagebuffer",imagebuffer)
          
          imageBuffer = imagebuffer.buffer;
              }
              console.log("filepathrelativetoserver before",filepathrelativetoserver)
        const filename=await bluritout(imageBuffer, "output.png", dir, blurringregions,filepathrelativetoserver);
        // console.log("blurringregions",blurringregions)
         filepath= process.env.BASE_URL+`/static/public/${filename}`;
        //  console.log("filepath",filepath)
        //  ?
      }
      const docJson = doc.toJSON();
      delete docJson.DataImage; // Remove the field you don't want to return

      return {
        ...docJson,
        isRestricted: isRestricted,
        filepath:filepath,
        template_id: template ? template.ID : null,
        restrictions: isRestricted ? restrictions.filter(r => r.DocumentID === doc.ID) : []
      };

    })
   Promise.all(newdocuments).then(newdocuments => {
    res.status(200).json({
      success: true,
      data: {
        documents: newdocuments,
        pagination: {
          currentPage: parsedPage,
          totalPages: Math.ceil(documents.count / parsedLimit) || 1,
          totalItems: documents.count,
          itemsPerPage: parsedLimit
        }
      }
    });
    })
    
    // console.log(newdocuments)
    // await bluritout()
    

  } catch (error) {
    console.error('Error fetching documents:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching documents',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

router.get('/alldocuments/:userid', async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '' } = req.query;
    const { userid } = req.params;
    // ⚡ FIX: Ensure limit and page are properly parsed as integers
    const parsedLimit = parseInt(limit, 10) || 10;
    const parsedPage = parseInt(page, 10) || 1;
    const offset = (parsedPage - 1) * parsedLimit;

    const whereClause = buildWhereClause(search);

    // ⚡ OPTIMIZATION: Parallelize initial queries
    const [restrictions, documents, OCRDocumentReadFields, templates] = await Promise.all([
      db.DocumentRestrictions.findAll({
        where: { UserID: userid },
        raw: true
      }),
      db.Documents.findAndCountAll({
        where: whereClause,
        attributes: {
          exclude: ['DataImage'] // 🚀 Skip BLOB data for list view
        },
        limit: parsedLimit,
        offset: offset,
        order: [['CreatedDate', 'DESC']]
      }),
      db.OCRDocumentReadFields.findAll({ 
        raw: true,
        order: [['CreatedAt', 'DESC']]
      }),
      db.Template.findAll({ raw: true })
    ]);
    
    const restrictedIds = restrictions.map(r => r.DocumentID);

    // ⚡ OPTIMIZATION: Simplified - use IsCurrentVersion flag for speed
    const linkIds = documents.rows.map(doc => String(doc.LinkID));
    
    // Fetch current versions first (fastest)
    const currentVersions = linkIds.length > 0 ? await db.DocumentVersions.findAll({
      where: { 
        LinkID: { [Op.in]: linkIds },
        IsCurrentVersion: true
      },
      attributes: ['ID', 'LinkID', 'VersionNumber', 'ModificationDate', 'ModifiedBy'],
      raw: true
    }).catch(() => []) : [];
    
    // Get missing LinkIDs
    const currentVersionLinkIds = new Set(currentVersions.map(v => String(v.LinkID)));
    const missingLinkIds = linkIds.filter(id => !currentVersionLinkIds.has(id));
    
    // Fetch latest for missing ones and filter to one per LinkID
    let latestVersions = [];
    if (missingLinkIds.length > 0) {
      const allLatest = await db.DocumentVersions.findAll({
        where: { LinkID: { [Op.in]: missingLinkIds } },
        attributes: ['ID', 'LinkID', 'VersionNumber', 'ModificationDate', 'ModifiedBy'],
        order: [['ModificationDate', 'DESC']],
        raw: true
      }).catch(() => []);
      
      // Filter to only latest per LinkID (fast in-memory)
      const latestMap = {};
      allLatest.forEach(v => {
        const linkId = String(v.LinkID);
        if (!latestMap[linkId]) {
          latestMap[linkId] = v;
        }
      });
      latestVersions = Object.values(latestMap);
    }
    
    const allVersions = [...currentVersions, ...latestVersions];
    
    // ⚡ OPTIMIZATION: Create version map (already filtered)
    const versionMap = {};
    allVersions.forEach(version => {
      const linkId = String(version.LinkID);
      versionMap[linkId] = version;
    });

    // ⚡ OPTIMIZATION: Lightweight processing for list view - no image processing
    const processedDocs = documents.rows.map(doc => {
      const docJson = doc.toJSON();
      const LinkID = doc.LinkID;
      const isRestricted = restrictedIds.includes(doc.ID + "");
      
      // Check if processed images already exist
      const dir = path.join(__dirname, `../public/images/nonredacteddocs/document_${doc.ID}`);
      const redactedDir = path.join(__dirname, `../public/images/redacteddocs/document_${doc.ID}`);
      const pathrelativetoserver = `document_${doc.ID}`;
      
      let fileUrl = null;
      
      // Try to find existing processed image
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir);
        if (files.length > 0) {
          const latestFile = files.sort().reverse()[0];
          fileUrl = `${process.env.BASE_URL}/static/public/nonredacteddocs/${pathrelativetoserver}/${latestFile}`;
        }
      }
      
      // Check for redacted version if restrictions exist
      if (isRestricted && fs.existsSync(redactedDir)) {
        const files = fs.readdirSync(redactedDir);
        if (files.length > 0) {
          const latestFile = files.sort().reverse()[0];
          fileUrl = `${process.env.BASE_URL}/static/public/redacteddocs/${pathrelativetoserver}/${latestFile}`;
        }
      }

      const matchedField = OCRDocumentReadFields.find(field => field.LinkId === doc.LinkID);
      const templateId = matchedField ? matchedField.template_id : null;
      
      return {
        ...docJson,
        isRestricted,
        filepath: fileUrl,
        template_id: templateId,
        versions: versionMap[LinkID] || null,
        restrictions: isRestricted ? restrictions.filter(r => r.DocumentID === doc.ID) : []
      };
    });

    return res.status(200).json({
      success: true,
      data: {
        documents: processedDocs,
        pagination: {
          currentPage: parsedPage,
          totalPages: Math.ceil(documents.count / parsedLimit) || 1,
          totalItems: documents.count,
          itemsPerPage: parsedLimit
        }
      }
    });
  } catch (error) {
    console.error('Error fetching documents:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching documents',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// ⚡ FIX: Shared analytics handler function
const getDocumentAnalyticsHandler = async (req, res) => {
   try {
     const { documentId } = req.params;
     
     // ⚡ FIX: Check if req.user exists
     if (!req.user || !req.user.id) {
       return res.status(401).json({ 
         success: false, 
         message: 'Authentication required' 
       });
     }
     
     const userId = req.user.id;
     
     // ⚡ OPTIMIZATION: Fetch initial document first for permission checks
     const latestestdocument = await db.Documents.findByPk(documentId, {
       attributes: ['ID', 'LinkID', 'DepartmentId', 'SubDepartmentId', 'Confidential', 'Active']
     });
     
     if (!latestestdocument) {
       return res.status(404).json({ success: false, message: 'Document not found' });
     }
     
     // ⚡ FIX: Ensure LinkID is converted to string for consistency (but keep original for fallback)
     const LinkID = String(latestestdocument.LinkID);
     const LinkIDNum = parseInt(latestestdocument.LinkID) || LinkID; // Fallback for numeric queries
     const departmentId = latestestdocument.DepartmentId;
     const subDepartmentId = latestestdocument.SubDepartmentId;
     const isConfidential = latestestdocument.Confidential === true || latestestdocument.Confidential === 1;
     
     // ⚡ DEBUG: Log permission check details
     console.log('Permission Check:', {
       userId,
       documentId,
       departmentId,
       subDepartmentId,
       isConfidential
     });
     
     // ⚡ OPTIMIZATION: Check permissions in parallel
     const [hasViewPermission, hasConfidentialPermission] = await Promise.all([
       checkUserPermission(userId, departmentId, subDepartmentId, 'View'),
       isConfidential ? checkUserPermission(userId, departmentId, subDepartmentId, 'Confidential') : Promise.resolve(true)
     ]);
     
     // ⚡ DEBUG: Log permission results
     console.log('Permission Results:', {
       hasViewPermission,
       hasConfidentialPermission,
       isConfidential
     });
     
     if (!hasViewPermission) {
       console.log('403 Error: User does not have View permission', {
         userId,
         departmentId,
         subDepartmentId
       });
       
       // Get diagnostic information to help debug
       let diagnostics = null;
       try {
         diagnostics = await diagnosePermissionIssue(userId, departmentId, subDepartmentId);
         console.log('Permission Diagnostics:', JSON.stringify(diagnostics, null, 2));
       } catch (diagError) {
         console.error('Error getting diagnostics:', diagError);
       }
       
       return res.status(403).json({
         success: false,
         message: 'You do not have permission to view documents in this department and document type',
         details: {
           userId,
           departmentId,
           subDepartmentId,
           documentId
         },
         diagnostics: process.env.NODE_ENV === 'development' ? diagnostics : undefined
       });
     }
     
     if (isConfidential && !hasConfidentialPermission) {
       console.log('403 Error: User does not have Confidential permission', {
         userId,
         departmentId,
         subDepartmentId
       });
       
       // Get diagnostic information to help debug
       let diagnostics = null;
       try {
         diagnostics = await diagnosePermissionIssue(userId, departmentId, subDepartmentId);
         console.log('Permission Diagnostics:', JSON.stringify(diagnostics, null, 2));
       } catch (diagError) {
         console.error('Error getting diagnostics:', diagError);
       }
       
       return res.status(403).json({
         success: false,
         message: 'You do not have permission to view confidential documents in this department and document type',
         details: {
           userId,
           departmentId,
           subDepartmentId,
           documentId,
           isConfidential: true
         },
         diagnostics: process.env.NODE_ENV === 'development' ? diagnostics : undefined
       });
     }
     
     // ⚡ OPTIMIZATION: Fetch document WITHOUT DataImage first (much faster), then fetch DataImage only if needed
     // ⚡ FIX: Wrap each query in try-catch to handle individual failures
     const [
       document,
       versions,
       OCRDocumentReadFields,
       collaborations,
       comments,
       auditTrails,
       restrictions,
       user,
       approvers,
       templates,
       approvalsforthisdoc
     ] = await Promise.all([
       // Main document WITHOUT DataImage (exclude heavy BLOB for faster query)
       db.Documents.findOne({
         where: { LinkID: LinkID, Active: true },
         attributes: { exclude: ['DataImage'] } // ⚡ OPTIMIZATION: Exclude large BLOB
       }).catch(err => {
         console.error('Error fetching document:', err);
         return null;
       }),
       // Versions - try string first, fallback to number
       (async () => {
         try {
           return await db.DocumentVersions.findAll({
             where: { LinkID: LinkID },
             order: [['ModificationDate', 'DESC']]
           });
         } catch {
           try {
             return await db.DocumentVersions.findAll({
               where: { LinkID: LinkIDNum },
               order: [['ModificationDate', 'DESC']]
             });
           } catch {
             return [];
           }
         }
       })(),
       // OCR Fields - try string first, fallback to number
       (async () => {
         try {
           return await db.OCRDocumentReadFields.findAll({
             where: { LinkId: LinkID },
             raw: true
           });
         } catch {
           try {
             return await db.OCRDocumentReadFields.findAll({
               where: { LinkId: LinkIDNum },
               raw: true
             });
           } catch {
             return [];
           }
         }
       })(),
       // Collaborations - try string first, fallback to number
       (async () => {
         try {
           return await db.DocumentCollaborations.findAll({
             where: { LinkID: LinkID }
           });
         } catch {
           try {
             return await db.DocumentCollaborations.findAll({
               where: { LinkID: LinkIDNum }
             });
           } catch {
             return [];
           }
         }
       })(),
       // Comments with pagination - try string first, fallback to number
       (async () => {
         try {
           return await db.DocumentComments.findAll({
             where: { LinkID: LinkID },
             order: [['CommentDate', 'DESC']],
             limit: 50
           });
         } catch {
           try {
             return await db.DocumentComments.findAll({
               where: { LinkID: LinkIDNum },
               order: [['CommentDate', 'DESC']],
               limit: 50
             });
           } catch {
             return [];
           }
         }
       })(),
       // Audit trails with pagination - try string first, fallback to number
       (async () => {
         try {
           return await db.DocumentAuditTrail.findAll({
             where: { LinkID: LinkID },
             order: [['ActionDate', 'DESC']],
             limit: 100
           });
         } catch {
           try {
             return await db.DocumentAuditTrail.findAll({
               where: { LinkID: LinkIDNum },
               order: [['ActionDate', 'DESC']],
               limit: 100
             });
           } catch {
             return [];
           }
         }
       })(),
       // Restrictions - try string first, fallback to number
       (async () => {
         try {
           return await db.DocumentRestrictions.findAll({
             where: { LinkID: LinkID, UserID: userId },
             order: [['CreatedDate', 'DESC']]
           });
         } catch {
           try {
             return await db.DocumentRestrictions.findAll({
               where: { LinkID: LinkIDNum, UserID: userId },
               order: [['CreatedDate', 'DESC']]
             });
           } catch {
             return [];
           }
         }
       })(),
       // User data
       db.Users.findOne({
         where: { ID: userId },
         attributes: ['ID', 'userAccessArray']
       }).catch(() => null),
       // Approvers - limit to essential fields only
       db.DocumentApprovers.findAll({ 
         raw: true,
         attributes: ['ID', 'ApproverID', 'DepartmentId', 'SubDepartmentId', 'Level', 'IsMajority']
       }).catch(() => []),
       // Templates - limit to essential fields only
       db.Template.findAll({ 
         raw: true,
         attributes: ['ID', 'fields', 'departmentId', 'subDepartmentId']
       }).catch(() => []),
       // Approvals - try string first, fallback to number
       (async () => {
         try {
           return await db.DocumentApprovals.findAll({
             where: { LinkID: LinkID },
             raw: true
           });
         } catch {
           try {
             return await db.DocumentApprovals.findAll({
               where: { LinkID: LinkIDNum },
               raw: true
             });
           } catch {
             return [];
           }
         }
       })()
     ]);
     
     if (!document) {
       return res.status(404).json({
         success: false,
         message: 'Document not found'
       });
     }

     // ⚡ OPTIMIZATION: Log activities in parallel (non-blocking)
     Promise.all([
       logAuditTrail(documentId, 'VIEWED', userId, null, null, req, LinkID),
       logCollaboratorActivity(documentId, userId, 'DOCUMENT_OPENED', req, null, LinkID)
     ]).catch(err => console.error('Error logging activities:', err));

     // ⚡ FIX: Process restrictions mapping efficiently with null checks
     const restrictionMap = {};
     if (Array.isArray(restrictions)) {
       restrictions.forEach(r => {
         if (r && r.Field && !restrictionMap[r.Field]) {
           restrictionMap[r.Field] = true;
         }
       });
     }
     
     // ⚡ FIX: Process OCR fields with null checks
     const updatedArray = Array.isArray(OCRDocumentReadFields) 
       ? OCRDocumentReadFields.map(item => {
           if (!item) return null;
           const newitem = JSON.parse(JSON.stringify(item));
           newitem.Restricted = restrictionMap[item.Field] || false;
           return newitem;
         }).filter(item => item !== null)
       : [];

     // ⚡ OPTIMIZATION: Process user access and approvers efficiently
     let userAccess = [];
     try {
       userAccess = user?.userAccessArray ? JSON.parse(user.userAccessArray) : [];
     } catch(e) {
       console.warn('Error parsing userAccessArray:', e);
     }
     
     const approversaccess = Array.isArray(approvers) 
       ? approvers.filter(e => 
           e && e.ApproverID && userAccess.includes(parseInt(e.ApproverID))
         )
       : [];
     
     const accessforthisdoc = approversaccess.find(e =>
       e && e.DepartmentId === document.DepartmentId && e.SubDepartmentId === document.SubDepartmentId
     );
     
     const approvalsforusertoacceptorreject = accessforthisdoc && Array.isArray(approvalsforthisdoc) 
       ? approvalsforthisdoc 
       : [];
     
     // ⚡ OPTIMIZATION: Return metadata immediately, check cache first (FASTEST)
     const docJson = typeof document.toJSON === 'function' ? document.toJSON() : document;
     const temppath = path.join(__dirname, `../public/images/nonredacteddocs/document_${document.ID}`);
     const redactedpath = path.join(__dirname, `../public/images/redacteddocs/document_${document.ID}`);
     const pathrelativetoserver = `document_${document.ID}`;
     
     let fileUrl = null;
     let isRestricted = Array.isArray(restrictions) && restrictions.some(r => r.DocumentID === document.ID);
     
     // ⚡ OPTIMIZATION: Check for cached images FIRST (instant response)
     if (fs.existsSync(temppath)) {
       const files = fs.readdirSync(temppath);
       if (files.length > 0) {
         const latestFile = files.sort().reverse()[0];
         // Check for redacted version if restricted
         if (isRestricted && fs.existsSync(redactedpath)) {
           const redactedFiles = fs.readdirSync(redactedpath);
           if (redactedFiles.length > 0) {
             const redactedFile = redactedFiles.sort().reverse()[0];
             fileUrl = `${process.env.BASE_URL}/static/public/redacteddocs/${pathrelativetoserver}/${redactedFile}`;
           } else {
             fileUrl = `${process.env.BASE_URL}/static/public/nonredacteddocs/${pathrelativetoserver}/${latestFile}`;
           }
         } else {
           fileUrl = `${process.env.BASE_URL}/static/public/nonredacteddocs/${pathrelativetoserver}/${latestFile}`;
         }
       }
     }
     
     // ⚡ OPTIMIZATION: If no cache, fetch DataImage and process in background (don't wait for response)
     if (!fileUrl) {
       // Fetch DataImage separately (only if needed)
       db.Documents.findOne({
         where: { LinkID: LinkID, Active: true },
         attributes: ['ID', 'DataImage', 'DataType', 'LinkID']
       })
         .then(docWithImage => {
           if (docWithImage && docWithImage.DataImage && docWithImage.DataImage.length > 0) {
             // Merge DataImage into document object
             document.DataImage = docWithImage.DataImage;
             document.DataType = docWithImage.DataType;
             
             // Start processing in background (non-blocking)
             return processDocument(document, restrictions || [], OCRDocumentReadFields || [], templates || [], false);
           }
           return null;
         })
         .then(result => {
           if (result) {
             console.log('Background image processing completed for document:', document.ID);
           }
         })
         .catch(err => {
           console.warn('Background image processing failed:', err.message);
         });
       
       // Return immediately with null filepath (frontend can poll or show loading)
       fileUrl = null;
     }
     
     // Remove DataImage from response (too large)
     delete docJson.DataImage;
     
     const processedDocs = [{
       ...docJson,
       filepath: fileUrl,
       isRestricted: isRestricted,
       template_id: OCRDocumentReadFields?.find(f => f.LinkId === LinkID)?.template_id || null,
       restrictions: isRestricted ? (restrictions || []).filter(r => r.DocumentID === document.ID) : []
     }];
     
     const docwith = {
       document: processedDocs,
       versions: versions || [],
       collaborations: collaborations || [],
       comments: comments || [],
       auditTrails: auditTrails || [],
       restrictions: restrictions || [],
       OCRDocumentReadFields: updatedArray,
       approvalsforusertoacceptorreject: approvalsforusertoacceptorreject
     };
     
     res.status(200).json({
       success: true,
       data: docwith
     });

   } catch (error) {
     console.error('Error fetching document:', error);
     console.error('Error stack:', error.stack);
     res.status(500).json({
       success: false,
       message: 'Error fetching document',
       error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
     });
   }
};

// ⚡ FIX: Support both routes for frontend compatibility
router.get('/:documentId/analytics', requireAuth, getDocumentAnalyticsHandler);
router.get('/documents/:documentId/analytics', requireAuth, getDocumentAnalyticsHandler);

// ==================== COLLABORATION CRUD OPERATIONS ====================

// CREATE - Add collaborator
router.post('/documents/:documentId/collaborators', async (req, res) => {
  try {
    const { documentId } = req.params;
    const { userId, collaboratorId, collaboratorName, collaboratorEmail, permissionLevel, addedBy } = req.body;
    const documentlinkid=await db.Documents.findByPk(documentId)
    const linkid=documentlinkid.LinkID
    const collaboration = await db.DocumentCollaborations.create({
      DocumentID: documentId,
      CollaboratorID: collaboratorId,
      LinkID:linkid,
      CollaboratorName: collaboratorName,
      CollaboratorEmail: collaboratorEmail,
      PermissionLevel: permissionLevel || 'READ',
      AddedBy: addedBy,
      AddedDate: new Date(),
      Active: true
    });

    await logAuditTrail(documentId, 'COLLABORATOR_ADDED', addedBy, null, collaboration.toJSON(), req,linkid);

    res.status(201).json({
      success: true,
      message: 'Collaborator added successfully',
      data: collaboration
    });

  } catch (error) {
    console.error('Error adding collaborator:', error);
    res.status(500).json({
      success: false,
      message: 'Error adding collaborator',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// READ - Get collaborators
router.get('/documents/:documentId/collaborators', async (req, res) => {
  try {
    const { documentId } = req.params;

    const collaborators = await db.DocumentCollaborations.findAll({
      where: { DocumentID: documentId, Active: true },
      include: [
        {
          model: db.Users,
          as: 'Collaborator',
          // attributes: ['id', 'userName', 'email']
        },
        {
          model: db.CollaboratorActivities,
          as: 'Activities',
          // where: { Active: true },
          required: false
        }
      ],
      order: [['AddedDate', 'DESC']]
    });

    res.status(200).json({
      success: true,
      data: collaborators
    });

  } catch (error) {
    console.error('Error fetching collaborators:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching collaborators',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// UPDATE - Update collaborator permissions
router.put('/documents/:documentId/collaborators/:collaboratorId', async (req, res) => {
  try {
    const { documentId, collaboratorId } = req.params;
    const { permissionLevel, updatedBy } = req.body;

    const oldCollaboration = await db.DocumentCollaborations.findOne({
      where: { DocumentID: documentId, CollaboratorID: collaboratorId }
    });
    const documentbypk=await db.Documents.findByPk(documentId)
    const linkid=documentbypk.LinkID
    await db.DocumentCollaborations.update(
      { PermissionLevel: permissionLevel },
      { where: { DocumentID: documentId, CollaboratorID: collaboratorId } }
    );

    const updatedCollaboration = await db.DocumentCollaborations.findOne({
      where: { DocumentID: documentId, CollaboratorID: collaboratorId }
    });

    await logAuditTrail(documentId, 'PERMISSION_CHANGED', updatedBy,
      oldCollaboration?.toJSON(), updatedCollaboration?.toJSON(), req, linkid);

    res.status(200).json({
      success: true,
      message: 'Collaborator permissions updated successfully',
      data: updatedCollaboration
    });

  } catch (error) {
    console.error('Error updating collaborator:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating collaborator',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// DELETE - Remove collaborator
router.delete('/documents/:documentId/collaborators/:collaboratorId',requireAuth, async (req, res) => {
  try {
    const { documentId, collaboratorId } = req.params;
    const removedBy=req?.user?.id
const documentbypk=await db.Documents.findByPk(documentId)
    const linkid=documentbypk.LinkID
    const collaboration = await db.DocumentCollaborations.findOne({
      where: { DocumentID: documentId, CollaboratorID: collaboratorId }
    });

    // await db.DocumentCollaborations.update(
    //   { Active: false },
    //   { where: { DocumentID: documentId, CollaboratorID: collaboratorId } }
    // );
    await db.DocumentCollaborations.destroy({
      where: {
        DocumentID: documentId,
        CollaboratorID: collaboratorId
      }
    });


    await logAuditTrail(documentId, 'COLLABORATOR_REMOVED', removedBy, collaboration?.toJSON(), null, req, linkid);

    res.status(200).json({
      success: true,
      message: 'Collaborator removed successfully'
    });

  } catch (error) {
    console.error('Error removing collaborator:', error);
    res.status(500).json({
      success: false,
      message: 'Error removing collaborator',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// ==================== COMMENTS CRUD OPERATIONS ====================



// ==================== COMMENTS CRUD OPERATIONS ====================

// CREATE - Add comment
router.post('/documents/:documentId/comments', async (req, res) => {
  try {
    const { documentId } = req.params;
    const { collaboratorId, collaboratorName, comment, commentType, parentCommentId, pageNumber } = req.body;
const documentbypk=await db.Documents.findByPk(documentId)
    const linkid=documentbypk.LinkID
    const newComment = await db.DocumentComments.create({
      DocumentID: documentId,
      LinkID:linkid,
      CollaboratorID: collaboratorId,
      CollaboratorName: collaboratorName,
      Comment: comment,
      CommentType: commentType || 'GENERAL',
      ParentCommentID: parentCommentId || null,
      PageNumber: pageNumber,
      CommentDate: new Date(),
      Active: true
    });

    await logAuditTrail(documentId, 'COMMENTED', collaboratorId, null, newComment.toJSON(), req,linkid);
    await logCollaboratorActivity(documentId, collaboratorId, 'COMMENT_ADDED', req,JSON.stringify(newComment.toJSON()),linkid);

    res.status(201).json({
      success: true,
      message: 'Comment added successfully',
      data: newComment
    });

  } catch (error) {
    console.error('Error adding comment:', error);
    res.status(500).json({
      success: false,
      message: 'Error adding comment',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// READ - Get comments
router.get('/documents/:documentId/comments', async (req, res) => {
  try {
    const { documentId } = req.params;

    const comments = await db.DocumentComments.findAll({
      where: { DocumentID: documentId, Active: true },
      include: [
        {
          model: db.DocumentComments,
          as: 'replies',
          where: { Active: true },
          required: false
        }
      ],
      order: [['CommentDate', 'DESC']]
    });

    res.status(200).json({
      success: true,
      data: comments
    });

  } catch (error) {
    console.error('Error fetching comments:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching comments',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// UPDATE - Update comment
router.put('/documents/:documentId/comments/:commentId', async (req, res) => {
  try {
    const { documentId, commentId } = req.params;
    const { comment, updatedBy } = req.body;

    const oldComment = await db.DocumentComments.findByPk(commentId);
    
    await db.DocumentComments.update(
      { Comment: comment },
      { where: { ID: commentId } }
    );

    const updatedComment = await db.DocumentComments.findByPk(commentId);

    await logCollaboratorActivity(documentId, updatedBy, 'COMMENT_EDITED', req,oldComment.LinkID);

    res.status(200).json({
      success: true,
      message: 'Comment updated successfully',
      data: updatedComment
    });

  } catch (error) {
    console.error('Error updating comment:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating comment',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// DELETE - Delete comment
router.delete('/documents/:documentId/comments/:commentId', async (req, res) => {
  try {
    const { documentId, commentId } = req.params;
    const { deletedBy } = req.body;
    const document=await db.Documents.findByPk(documentId)
    const linkid=document.LinkID

    await db.DocumentComments.update(
      { Active: false },
      { where: { ID: commentId } }
    );

    await logCollaboratorActivity(documentId, deletedBy, 'COMMENT_DELETED', req,null,linkid);

    res.status(200).json({
      success: true,
      message: 'Comment deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting comment:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting comment',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});


// ==================== APPROVAL CRUD OPERATIONS ====================

const approvalHelper = require('../utils/approvalHelper');

// CREATE - Request approval (NEW - Auto-create based on Approval Matrix)
const createApprovalRequestHandler = async (req, res) => {
  try {
    const { documentId } = req.params;
    
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }
    
    const requestedBy = req.user.id || req.user.userName;

    const document = await db.Documents.findByPk(documentId);
    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    // Ensure LinkID is a string
    const linkId = String(document.LinkID || documentId);

    // Validate DepartmentId and SubDepartmentId
    if (!document.DepartmentId || !document.SubDepartmentId) {
      return res.status(400).json({
        success: false,
        message: 'Document must have DepartmentId and SubDepartmentId to request approval'
      });
    }

    // Check if approval already requested
    const existingTracking = await db.DocumentApprovalTracking.findOne({
      where: { DocumentID: documentId, LinkID: linkId }
    });

    if (existingTracking) {
      // Reset tracking to restart approval flow
      await existingTracking.update({
        CurrentLevel: 1,
        LevelsCompleted: 0,
        FinalStatus: 'PENDING',
        UpdatedDate: new Date()
      });

      // Archive / cancel previous approval requests
      await db.DocumentApprovals.update({
        Status: 'ARCHIVED',
        IsCancelled: true
      }, {
        where: {
          DocumentID: documentId,
          LinkID: linkId
        }
      });
    }

    // Get Approval Matrix
    const matrix = await approvalHelper.getApprovalMatrix(document.DepartmentId, document.SubDepartmentId);
    if (!matrix) {
      return res.status(400).json({
        success: false,
        message: 'No Approval Matrix configured for this Department/SubDepartment'
      });
    }

    // Calculate total levels
    const totalLevels = await approvalHelper.calculateTotalLevels(document.DepartmentId, document.SubDepartmentId);
    if (totalLevels === 0) {
      return res.status(400).json({
        success: false,
        message: 'No approvers configured for this Department/SubDepartment'
      });
    }

    // Create tracking record
    const tracking = await approvalHelper.getOrCreateTracking(
      documentId,
      linkId,
      document.DepartmentId,
      document.SubDepartmentId,
      totalLevels,
      matrix.AllorMajority
    );

    // Create approval requests for Level 1
    const requests = await approvalHelper.createApprovalRequestsForLevel(
      documentId,
      linkId,
      1,
      requestedBy
    );

    await logAuditTrail(documentId, 'APPROVAL_REQUESTED', requestedBy, null, { tracking, requests }, req, linkId);

    res.status(201).json({
      success: true,
      message: 'Approval requests created successfully',
      data: {
        tracking: tracking,
        requests: requests,
        currentLevel: 1,
        totalLevels: totalLevels
      }
    });

  } catch (error) {
    console.error('Error requesting approval:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Error requesting approval',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

router.post('/documents/:documentId/approvals/request', requireAuth, createApprovalRequestHandler);
router.post('/:documentId/approvals/request', requireAuth, createApprovalRequestHandler);

// CREATE - Request approval (OLD - Manual, kept for backward compatibility)
router.post('/documents/:documentId/approvals', async (req, res) => {
  try {
    const { documentId } = req.params;
    const { requestedBy, approverId, approverName, priority, dueDate, comments } = req.body;
const documentbypk=await db.Documents.findByPk(documentId)
    const linkid=documentbypk.LinkID

    const doesexists=await db.DocumentApprovals.findOne({
      where:{
        RequestedBy: requestedBy,
        LinkID:linkid
      }
    })
    if(doesexists){
      return res.json({status:false,message:"request already made"})
    }
    const approval = await db.DocumentApprovals.create({
      DocumentID: documentId,
      RequestedBy: requestedBy,
      LinkID:linkid,
      RequestedDate: new Date(),
      ApproverID: approverId,
      ApproverName: approverName,
      Status: 'PENDING',
      Priority: priority || 'MEDIUM',
      DueDate: dueDate,
      Comments: comments,
      Active: true
    });

    await logAuditTrail(documentId, 'APPROVAL_REQUESTED', requestedBy, null, approval.toJSON(), req,linkid);

    res.status(201).json({
      success: true,
      message: 'Approval requested successfully',
      data: approval
    });

  } catch (error) {
    console.error('Error requesting approval:', error);
    res.status(500).json({
      success: false,
      message: 'Error requesting approval',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// READ - Get approvals
// ⚡ OPTIMIZED: Uses OR condition for LinkID and parallel document fetch
router.get('/documents/:documentId/approvals', async (req, res) => {
  try {
    const { documentId } = req.params;
    const { Op } = require('sequelize');
    
    // ⚡ OPTIMIZATION: Fetch document with only needed fields (exclude heavy BLOB)
    const doc = await db.Documents.findByPk(documentId, {
      attributes: ['ID', 'LinkID', 'DepartmentId', 'SubDepartmentId'],
      raw: true
    });
    
    if (!doc) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }
    
    // ⚡ OPTIMIZATION: Handle LinkID type using OR condition (single query)
    const linkid = String(doc.LinkID);
    const linkidNum = isNaN(doc.LinkID) ? null : parseInt(doc.LinkID);
    
    // ⚡ OPTIMIZATION: Single query with OR condition instead of try-catch fallback
    const approvals = await db.DocumentApprovals.findAll({
      where: {
        [Op.or]: linkidNum !== null && linkidNum !== linkid
          ? [{ LinkID: linkid }, { LinkID: linkidNum }]
          : [{ LinkID: linkid }]
      },
      order: [['RequestedDate', 'DESC']],
      raw: true,
      limit: 1000 // Prevent huge result sets
    }).catch(() => []);

    res.status(200).json({
      success: true,
      data: Array.isArray(approvals) ? approvals : []
    });

  } catch (error) {
    console.error('Error fetching approvals:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error fetching approvals',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

router.get('/documents/:documentId/approval/:id', async (req, res) => {
  try {
    const { documentId ,id} = req.params;
    const doc=await db.Documents.findByPk(documentId)
    const linkid=doc.LinkID
    const approval = await db.DocumentApprovals.findOne({
      where: { ID: id },
      order: [['RequestedDate', 'DESC']]
    });

    res.status(200).json({
      success: true,
      data: approval
    });

  } catch (error) {
    console.error('Error fetching approvals:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching approvals',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// UPDATE - Approve/Reject (NEW - With level progression logic)
const updateApprovalHandler = async (req, res) => {
  try {
    const { documentId, approvalId } = req.params;
    const { status, comments, rejectionReason } = req.body;
    const approverId = req.user.id || req.user.userName;
    const approverName = req.user.userName || req.user.id;

    const oldApproval = await db.DocumentApprovals.findByPk(approvalId);
    if (!oldApproval) {
      return res.status(404).json({
        success: false,
        message: 'Approval request not found'
      });
    }

    const document = await db.Documents.findByPk(documentId);
    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    // Check if already processed
    if (oldApproval.Status !== 'PENDING' && !oldApproval.IsCancelled) {
      return res.status(400).json({
        success: false,
        message: 'This approval request has already been processed'
      });
    }

    // Normalize status to uppercase
    const normalizedStatus = status ? status.toUpperCase() : 'PENDING';
    if (normalizedStatus !== 'APPROVED' && normalizedStatus !== 'REJECTED') {
      return res.status(400).json({
        success: false,
        message: 'Status must be either "APPROVED" or "REJECTED"'
      });
    }

    // Update approval status
    await db.DocumentApprovals.update({
      Status: normalizedStatus,
      ApprovalDate: new Date(),
      ApproverID: approverId,
      ApproverName: approverName,
      Comments: comments,
      RejectionReason: rejectionReason,
      IsCancelled: false
    }, {
      where: { ID: approvalId }
    });

    const updatedApproval = await db.DocumentApprovals.findByPk(approvalId);
    const currentLevel = updatedApproval.SequenceLevel;

    // Cancel remaining requests in same level
    await approvalHelper.cancelRemainingRequests(documentId, document.LinkID, currentLevel, approvalId);

    // Get tracking
    const tracking = await db.DocumentApprovalTracking.findOne({
      where: { DocumentID: documentId, LinkID: document.LinkID }
    });

    if (tracking) {
      // Check if all levels completed BEFORE incrementing
      const newLevelsCompleted = tracking.LevelsCompleted + 1;
      const allCompleted = newLevelsCompleted >= tracking.TotalLevels;

      // Update tracking
      await approvalHelper.updateTracking(documentId, {
        LevelsCompleted: newLevelsCompleted
      });

      if (allCompleted) {
        // Calculate final status
        const finalStatus = await approvalHelper.calculateFinalStatus(documentId, document.LinkID);
        
        await logAuditTrail(documentId, `APPROVAL_${finalStatus}`, approverId, oldApproval?.toJSON(), { finalStatus }, req, document.LinkID);

        return res.status(200).json({
          success: true,
          message: `All approval levels completed. Document ${finalStatus.toLowerCase()}.`,
          data: {
            approval: updatedApproval,
            finalStatus: finalStatus,
            allLevelsCompleted: true
          }
        });
      } else {
        // Move to next level
        const nextLevelResult = await approvalHelper.moveToNextLevel(documentId, document.LinkID, currentLevel, approverId);

        if (nextLevelResult.hasNextLevel) {
          await logAuditTrail(documentId, `APPROVAL_LEVEL_${currentLevel}_${normalizedStatus}`, approverId, oldApproval?.toJSON(), { level: currentLevel, status: normalizedStatus, nextLevel: nextLevelResult.level }, req, document.LinkID);

          return res.status(200).json({
            success: true,
            message: `Level ${currentLevel} ${normalizedStatus.toLowerCase()}. Moved to Level ${nextLevelResult.level}.`,
            data: {
              approval: updatedApproval,
              currentLevel: nextLevelResult.level,
              allLevelsCompleted: false
            }
          });
        }
      }
    }

    // Log action
    const action = normalizedStatus === 'APPROVED' ? 'APPROVED' : 'REJECTED';
    await logAuditTrail(documentId, action, approverId, oldApproval?.toJSON(), updatedApproval?.toJSON(), req, document.LinkID);

    res.status(200).json({
      success: true,
      message: `Approval ${normalizedStatus.toLowerCase()} successfully`,
      data: updatedApproval
    });

  } catch (error) {
    console.error('Error updating approval:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating approval',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// CANCEL - Cancel all pending approval requests (must be before :approvalId route)
const cancelApprovalHandler = async (req, res) => {
  try {
    const { documentId } = req.params;
    const { cancellationReason, approverId } = req.body;
    const cancelledBy = req.user.id || req.user.userName || approverId;
    const cancelledByName = req.user.userName || req.user.id || approverId;

    // Find document
    const document = await db.Documents.findByPk(documentId);
    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    // ⚡ FIX: Handle LinkID type (string or number)
    const linkId = String(document.LinkID);
    const linkIdNum = parseInt(document.LinkID) || linkId;

    // Find all pending approval requests for this document
    let pendingApprovals;
    try {
      pendingApprovals = await db.DocumentApprovals.findAll({
        where: {
          DocumentID: documentId,
          LinkID: linkId,
          Status: 'PENDING',
          IsCancelled: false
        }
      });
    } catch {
      pendingApprovals = await db.DocumentApprovals.findAll({
        where: {
          DocumentID: documentId,
          LinkID: linkIdNum,
          Status: 'PENDING',
          IsCancelled: false
        }
      });
    }

    if (!pendingApprovals || pendingApprovals.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No pending approval requests found for this document'
      });
    }

    // Store old values for audit trail
    const oldValues = pendingApprovals.map(approval => approval.toJSON());

    // Cancel all pending approvals
    const updateData = {
      IsCancelled: true,
      Status: 'CANCELLED',
      ApprovalDate: new Date()
    };

    // Add cancellation reason to Comments if provided
    if (cancellationReason) {
      updateData.Comments = cancellationReason;
    }

    // Update all pending approvals
    let updatedCount;
    try {
      const [count] = await db.DocumentApprovals.update(updateData, {
        where: {
          DocumentID: documentId,
          LinkID: linkId,
          Status: 'PENDING',
          IsCancelled: false
        }
      });
      updatedCount = count;
    } catch {
      const [count] = await db.DocumentApprovals.update(updateData, {
        where: {
          DocumentID: documentId,
          LinkID: linkIdNum,
          Status: 'PENDING',
          IsCancelled: false
        }
      });
      updatedCount = count;
    }

    // Get updated approvals for response
    let cancelledApprovals;
    try {
      cancelledApprovals = await db.DocumentApprovals.findAll({
        where: {
          DocumentID: documentId,
          LinkID: linkId,
          IsCancelled: true,
          Status: 'CANCELLED'
        },
        order: [['RequestedDate', 'DESC']]
      });
    } catch {
      cancelledApprovals = await db.DocumentApprovals.findAll({
        where: {
          DocumentID: documentId,
          LinkID: linkIdNum,
          IsCancelled: true,
          Status: 'CANCELLED'
        },
        order: [['RequestedDate', 'DESC']]
      });
    }

    // Update tracking if exists
    const tracking = await db.DocumentApprovalTracking.findOne({
      where: { DocumentID: documentId, LinkID: linkId }
    });

    if (!tracking) {
      // Try with numeric LinkID
      const trackingNum = await db.DocumentApprovalTracking.findOne({
        where: { DocumentID: documentId, LinkID: linkIdNum }
      });
      if (trackingNum) {
        await trackingNum.update({
          FinalStatus: 'CANCELLED',
          UpdatedDate: new Date()
        });
      }
    } else {
      await tracking.update({
        FinalStatus: 'CANCELLED',
        UpdatedDate: new Date()
      });
    }

    // Log audit trail
    await logAuditTrail(
      documentId,
      'APPROVAL_CANCELLED',
      cancelledBy,
      oldValues,
      {
        cancelledApprovals: cancelledApprovals.map(a => a.toJSON()),
        cancellationReason: cancellationReason || null,
        cancelledBy: cancelledByName
      },
      req,
      document.LinkID
    );

    res.status(200).json({
      success: true,
      message: `Successfully cancelled ${updatedCount} approval request(s)`,
      data: {
        cancelledCount: updatedCount,
        cancelledApprovals: cancelledApprovals,
        cancellationReason: cancellationReason || null,
        cancelledBy: cancelledByName
      }
    });

  } catch (error) {
    console.error('Error cancelling approvals:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Error cancelling approval requests',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

router.put('/documents/:documentId/approvals/cancel', requireAuth, cancelApprovalHandler);
router.put('/:documentId/approvals/cancel', requireAuth, cancelApprovalHandler);

router.put('/documents/:documentId/approvals/:approvalId', requireAuth, updateApprovalHandler);
router.put('/:documentId/approvals/:approvalId', requireAuth, updateApprovalHandler);

// GET - Approval status with level details
// ⚡ OPTIMIZED: Removed redundant try-catch fallback, uses optimized helper
const getApprovalStatusHandler = async (req, res) => {
  try {
    const { documentId } = req.params;
    
    // ⚡ OPTIMIZATION: Fetch document with only needed fields (exclude heavy BLOB)
    const document = await db.Documents.findByPk(documentId, {
      attributes: ['ID', 'LinkID', 'DepartmentId', 'SubDepartmentId'],
      raw: false
    });
    
    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    // ⚡ OPTIMIZATION: Helper now handles LinkID type internally with OR condition
    const linkId = String(document.LinkID || documentId);
    const status = await approvalHelper.getApprovalStatus(documentId, linkId);

    if (!status) {
      return res.status(200).json({
        success: true,
        message: 'No approval tracking found for this document',
        data: {
          finalStatus: 'PENDING',
          allorMajority: 'MAJORITY',
          currentLevel: 0,
          totalLevels: 0,
          levelsCompleted: 0
        }
      });
    }

    res.status(200).json({
      success: true,
      data: {
        finalStatus: status.finalStatus || 'PENDING',
        allorMajority: status.allorMajority || 'MAJORITY',
        currentLevel: status.currentLevel || 0,
        totalLevels: status.totalLevels || 0,
        levelsCompleted: status.tracking?.LevelsCompleted || 0,
        levelDetails: status.levelDetails || {}
      }
    });

  } catch (error) {
    console.error('Error fetching approval status:', error.message);
    
    res.status(500).json({
      success: false,
      message: 'Error fetching approval status',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

router.get('/documents/:documentId/approvals/status', requireAuth, getApprovalStatusHandler);
router.get('/:documentId/approvals/status', requireAuth, getApprovalStatusHandler);

// ==================== RESTRICTIONS CRUD OPERATIONS ====================

// CREATE - Add restriction old, field based only
router.post('/documents/:documentId/restrictions',requireAuth, async (req, res) => {
  try {
    const { documentId } = req.params;
    const { UserID, UserRole, restrictedFields, allowedActions, deniedActions, createdBy, reason,Field } = req.body;
    const documentbypk=await db.Documents.findByPk(documentId)
    const linkid=documentbypk.LinkID
    const restriction = await db.DocumentRestrictions.create({
      DocumentID: documentId,
      Field:Field,
      UserID: UserID,
      LinkID:linkid,
      UserRole: UserRole,
      RestrictedFields: restrictedFields || [],
      AllowedActions: allowedActions || ['read'],
      DeniedActions: deniedActions || [],
      CreatedBy: req.user.id,
      CreatedDate: new Date(),
      Reason: reason,
      Active: true
    });

    await logAuditTrail(documentId, 'RESTRICTION_APPLIED', req.user.id, null, JSON.stringify(restriction.toJSON()), req,linkid);

    res.status(201).json({
      success: true,
      message: 'Restriction applied successfully',
      data: restriction
    });

  } catch (error) {
    console.error('Error applying restriction:', error);
    res.status(500).json({
      success: false,
      message: 'Error applying restriction',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});


// CREATE - Add restriction new, paragraph based
router.post('/documents/:documentId/restrictions_new',requireAuth, async (req, res) => {
  try {
    const { documentId } = req.params;
    const { UserID, UserRole, restrictedFields, allowedActions, deniedActions, createdBy, reason,Field, restrictedType, restrictionType, xaxis, yaxis, width, height } = req.body;
    console.error(restrictionType);

    const documentbypk=await db.Documents.findByPk(documentId)
    if(!documentbypk) {
      throw new Error("Error : document not found");
    }
    const linkid=documentbypk.LinkID
    const restriction = await db.DocumentRestrictions.create({
      DocumentID: documentId,
      Field:Field,
      UserID: UserID,
      LinkID:linkid,
      UserRole: UserRole,
      RestrictedFields: restrictedFields || [],
      AllowedActions: allowedActions || ['read'],
      DeniedActions: deniedActions || [],
      restrictionType,
      xaxis,
      yaxis,
      height,
      width,
      CreatedBy: req.user.id,
      CreatedDate: new Date(),
      Reason: reason,
      Active: true
    });
    console.error(restriction.toJSON());


    await logAuditTrail(documentId, 'RESTRICTION_APPLIED', req.user.id, null, JSON.stringify(restriction.toJSON()), req,linkid);

    res.status(201).json({
      success: true,
      message: 'Restriction applied successfully',
      data: restriction
    });

  } catch (error) {
    console.error('Error applying restriction:', error);
    res.status(500).json({
      success: false,
      message: 'Error applying restriction',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// READ - Get restrictions
router.get('/documents/:documentId/restrictions', async (req, res) => {
  try {
    const { documentId } = req.params;

    const restrictions = await db.DocumentRestrictions.findAll({
      where: { DocumentID: documentId },
      order: [['CreatedDate', 'DESC']]
    });

    res.status(200).json({
      success: true,
      data: restrictions
    });

  } catch (error) {
    console.error('Error fetching restrictions:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching restrictions',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});
router.get('/documents/:documentId/restrictions/:id', async (req, res) => {
  try {
    const { documentId,id } = req.params;

    const restrictions = await db.DocumentRestrictions.findOne({
      where: { ID: id },
      order: [['CreatedDate', 'DESC']]
    });

    res.status(200).json({
      success: true,
      data: restrictions
    });

  } catch (error) {
    console.error('Error fetching restrictions:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching restrictions',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});
// DELETE - Remove restriction
router.delete('/documents/:documentId/restrictions/:restrictionId',requireAuth, async (req, res) => {
  try {
    const { documentId, restrictionId } = req.params;
    const  removedBy  = req.user.id;
const documentbypk=await db.Documents.findByPk(documentId)
    const linkid=documentbypk.LinkID
    const restriction = await db.DocumentRestrictions.findByPk(restrictionId);

    await db.DocumentRestrictions.destroy(
     
      { where: { ID: restrictionId } }
    );

    await logAuditTrail(documentId, 'RESTRICTION_REMOVED', removedBy, restriction?.toJSON(), null, req,linkid);

    res.status(200).json({
      success: true,
      message: 'Restriction removed successfully'
    });

  } catch (error) {
    console.error('Error removing restriction:', error);
    res.status(500).json({
      success: false,
      message: 'Error removing restriction',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// ==================== AUDIT TRAIL & ANALYTICS ====================

// READ - Get audit trail
router.get('/documents/:documentId/audit-trail', async (req, res) => {
  try {
    const { documentId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    const auditTrail = await DocumentAuditTrailModel.findAndCountAll({
      where: { DocumentID: documentId },
      order: [['ActionDate', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.status(200).json({
      success: true,
      data: {
        auditTrail: auditTrail.rows,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(auditTrail.count / limit),
          totalItems: auditTrail.count,
          itemsPerPage: parseInt(limit)
        }
      }
    });

  } catch (error) {
    console.error('Error fetching audit trail:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching audit trail',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// READ - Get collaborator activities
router.get('/documents/:documentId/activities', async (req, res) => {
  try {
    const { documentId } = req.params;
    const { collaboratorId, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = { DocumentID: documentId };
    if (collaboratorId) {
      whereClause.CollaboratorID = collaboratorId;
    }

    const activities = await CollaboratorActivitiesModel.findAndCountAll({
      where: whereClause,
      order: [['ActivityDate', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.status(200).json({
      success: true,
      data: {
        activities: activities.rows,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(activities.count / limit),
          totalItems: activities.count,
          itemsPerPage: parseInt(limit)
        }
      }
    });

  } catch (error) {
    console.error('Error fetching activities:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching activities',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// READ - Get document statistics
router.get('/documents/:documentId/statistics', async (req, res) => {
  try {
    const { documentId } = req.params;

    const stats = {
      totalVersions: await DocumentVersionsModel.count({
        where: { DocumentID: documentId, Active: true }
      }),
      totalCollaborators: await DocumentCollaborationsModel.count({
        where: { DocumentID: documentId, Active: true }
      }),
      totalComments: await DocumentCommentsModel.count({
        where: { DocumentID: documentId, Active: true }
      }),
      pendingApprovals: await DocumentApprovalsModel.count({
        where: { DocumentID: documentId, Status: 'PENDING', Active: true }
      }),
      totalAuditEntries: await DocumentAuditTrailModel.count({
        where: { DocumentID: documentId }
      }),
      recentActivities: await CollaboratorActivitiesModel.count({
        where: {
          DocumentID: documentId,
          ActivityDate: {
            [Op.gte]: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
          }
        }
      })
    };

    res.status(200).json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('Error fetching statistics:', error);

    res.status(500).json({
      success: false,
      message: 'Error fetching statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
}
);



// GET all document types
router.get('/documenttypes', async (req, res) => {
  try {
    const types = await db.DocumentType.findAll();
    res.json({
      status: true,
      message: 'Document types fetched successfully',
      types
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch document types' });
  }
});

// GET a document type by ID
router.get('/documenttypes/:id', async (req, res) => {
  try {
    const type = await db.DocumentType.findByPk(req.params.id);
    if (!type) return res.status(404).json({ error: 'Document type not found' });
    res.json({
      status: true,
      message: 'Document type fetched successfully',
      type
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch document type' });
  }
});

// POST (create) a new document type
router.post('/documenttypes', async (req, res) => {
  try {
    const { Type, Code } = req.body;
    if (!Type || !Code) {
      return res.status(400).json({ error: 'Type and Code are required' });
    }

    const newType = await db.DocumentType.create({ Type, Code });
    res.status(201).json(newType);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create document type' });
  }
});

// PUT (update) a document type by ID
router.put('/documenttypes/:id', async (req, res) => {
  try {
    const { Type, Code } = req.body;
    const type = await db.DocumentType.findByPk(req.params.id);
    if (!type) return res.status(404).json({ error: 'Document type not found' });

    type.Type = Type || type.Type;
    type.Code = Code || type.Code;
    await type.save();

    res.json(type);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update document type' });
  }
});

// DELETE a document type by ID
router.delete('/documenttypes/:id', async (req, res) => {
  try {
    const type = await db.DocumentType.findByPk(req.params.id);
    if (!type) return res.status(404).json({ error: 'Document type not found' });

    await type.destroy();
    res.json({status:true, message: 'Document type deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete document type' });
  }
});




// 👉 GET all approvers
router.get('/document-approvers', async (req, res) => {
  try {
    const departmentId = req.query.departmentId || req.query.DepartmentId;
    const subDepartmentId = req.query.subDepartmentId || req.query.SubDepartmentId;
    const level = req.query.level || req.query.Level;
    const active = req.query.active || req.query.Active;

    const where = {};
    
    if (departmentId) where.DepartmentId = departmentId;
    if (subDepartmentId) where.SubDepartmentId = subDepartmentId;
    if (level) where.SequenceLevel = level;
    if (active !== undefined) where.Active = active === 'true' || active === true || active === '1' || active === 1;

    const approvers = await DocumentApprovers.findAll({
      where: Object.keys(where).length > 0 ? where : {},
      order: [['DepartmentId', 'ASC'], ['SubDepartmentId', 'ASC'], ['SequenceLevel', 'ASC']]
    });
    
    return res.status(200).json({
      status: true,
      approvers
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 👉 GET approvers by Department and SubDepartment
router.get('/document-approvers/by-dept-subdept/:deptId/:subDeptId', async (req, res) => {
  try {
    const { deptId, subDeptId } = req.params;
    const approvers = await DocumentApprovers.findAll({
      where: {
        DepartmentId: deptId,
        SubDepartmentId: subDeptId,
        Active: true
      },
      order: [['SequenceLevel', 'ASC']]
    });
    
    return res.status(200).json({
      status: true,
      approvers
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 👉 GET approvers by level
router.get('/document-approvers/by-level/:deptId/:subDeptId/:level', async (req, res) => {
  try {
    const { deptId, subDeptId, level } = req.params;
    const approvers = await DocumentApprovers.findAll({
      where: {
        DepartmentId: deptId,
        SubDepartmentId: subDeptId,
        SequenceLevel: level,
        Active: true
      }
    });
    
    return res.status(200).json({
      status: true,
      approvers
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 👉 GET single approver by ID
router.get('/document-approvers/:id', async (req, res) => {
  try {
    const approver = await DocumentApprovers.findByPk(req.params.id);
    if (!approver) return res.status(404).json({ message: 'Approver not found' });
      return res.status(200).json({
      status:true,
      approver:approver
    });
    // res.status(200).json(approver);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 👉 CREATE new approver
router.post('/document-approvers', async (req, res) => {
  try {
    const { DepartmentId, SubDepartmentId, ApproverID, SequenceLevel, Active } = req.body;
    const newApprover = await DocumentApprovers.create({ 
      DepartmentId, 
      SubDepartmentId, 
      ApproverID,
      SequenceLevel: SequenceLevel || 1,
      Active: Active !== undefined ? Active : true
    });
    return res.status(200).json({
      status: true,
      approver: newApprover
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 👉 UPDATE existing approver
router.put('/document-approvers/:id', async (req, res) => {
  try {
    const { DepartmentId, SubDepartmentId, ApproverID, SequenceLevel, Active } = req.body;
    const approver = await DocumentApprovers.findByPk(req.params.id);
    if (!approver) return res.status(404).json({ message: 'Approver not found' });

    const updateData = {};
    if (DepartmentId !== undefined) updateData.DepartmentId = DepartmentId;
    if (SubDepartmentId !== undefined) updateData.SubDepartmentId = SubDepartmentId;
    if (ApproverID !== undefined) updateData.ApproverID = ApproverID;
    if (SequenceLevel !== undefined) updateData.SequenceLevel = SequenceLevel;
    if (Active !== undefined) updateData.Active = Active;

    await approver.update(updateData);
    return res.status(200).json({
      status: true,
      approver: approver
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 👉 DELETE an approver
router.delete('/document-approvers/:id', async (req, res) => {
  try {
    const approver = await DocumentApprovers.findByPk(req.params.id);
    if (!approver) return res.status(404).json({ message: 'Approver not found' });

    await approver.destroy();
      return res.status(200).json({
      status:true,
      approver:approver
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router.get("/restore/:DocumentId",requireAuth,async(req,res)=>{

  try {
    const { DocumentId } = req.params;
    const Document = await db.Documents.findByPk(DocumentId);
    if (!Document) return res.status(404).json({ message: 'Document not found' });
    const LinkID=Document.LinkID
    // mark this document as active and all other deactivated
    
    await db.Documents.update({ Active: false }, { where: { LinkID: LinkID } });
    await Document.update({ Active: true });
    await logAuditTrail(DocumentId, 'DOCUMENT_RESTORED', req.user.id, "restored", null, req, LinkID);

    return res.status(200).json({
      status: true,
      message: 'Document restored successfully',
      Document
    });

} catch (error) {
  console.error('Error restoring document:', error);
  return res.status(500).json({
    status: false,
    message: 'Error restoring document',
    error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
  });
}
})

router.get('/activities-dashboard', requireAuth, async (req, res) => {
  try {
    const auditTrails = await db.DocumentAuditTrail.findAll({
      include: [
        {
          model: db.Users,
          as: 'actor',
          attributes: ['id', 'userName']
        },
        {
          model: db.Documents,
          as: 'documentNew',
          attributes: { exclude: ['DataImage'] },
          required: false
        }
      ],
      order: [['ActionDate', 'DESC']],
      limit: 10
    });
    
    const docwith = {
      auditTrails,
    };

    res.status(200).json({
      success: true,
      data: docwith
    });

  } catch (error) {
    console.error('Error fetching document:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching document',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});


module.exports = router;