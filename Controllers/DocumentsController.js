const express = require('express');
const { Sequelize, DataTypes, Op, or } = require('sequelize');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;

const { spawn } = require('child_process');
const router = express.Router();
const db = require('../config/database'); 
const DocumentApprovers = db.DocumentApprovers;
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


async function processDocument(doc, restrictions, OCRFields, templates) {
  const restrictions_open_draw = restrictions.map(r => r.dataValues);

  const docJson = doc.toJSON();
  const timestampfocdocumentlinkid=new Date().getTime()+"_"+doc.LinkID
  
  console.log("herer 1")
  const dir = path.join(__dirname, `../public/images/redacteddocs/document_${doc.ID}`);
  const temppath=path.join(__dirname, `../public/images/nonredacteddocs/document_${doc.ID}`)
  const pathrelativetoserver=`document_${doc.ID}`
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(temppath)) fs.mkdirSync(temppath, { recursive: true });
  await clearDirectory(dir);
  await clearDirectory(temppath);
   // write image or pdf buffer to disk

  let imageBuffer = doc.DataImage;
  let fileUrl ;
  const isRestricted = restrictions.some(r => r.DocumentID === doc.ID);

  const matchedField = OCRFields.find(field => field.LinkId === doc.LinkID);
  const templateId = matchedField ? matchedField.template_id : null;

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
  console.log("templateId",templateId)
  if (templateId) {
    const template = templates.find(t => t.ID == templateId);
    const templateFields = template?.fields ? JSON.parse(template.fields) : [];

    const blurRegions = templateFields.filter(field =>
      restrictions.some(r => r.DocumentID === doc.ID && r.Field === field.fieldName)
    );

    // Merge both restriction type arrays
    const mergedArray_blur = [...restrictions_open_draw, ...blurRegions];

    console.log(mergedArray_blur);
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
console.log("fileUrl",fileUrl)
  delete docJson.DataImage;

  return {
    ...docJson,
    isRestricted,
    filepath: fileUrl,
    template_id: templateId,
    restrictions: isRestricted ? restrictions.filter(r => r.DocumentID === doc.ID) : []
  };
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
    const { id,dataImage } = req.body;
    
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

    // Extract optional fields with fallback to existing values
    const {
      filename, filedate, Text1, Date1, Text2, Date2, Text3, Date3,
      Text4, Date4, Text5, Date5, Text6, Date6, Text7, Date7,
      Text8, Date8, Text9, Date9, Text10, Date10,
      expiration, confidential, expdate, remarks, dep, subdep,
      publishing_status, FileDescription, Description
    } = req.body;

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

    // Handle versioning
    let versionNumber = `v1`;
    const prevVersion = await db.DocumentVersions.findOne({
      where: { DocumentID: record.ID, IsCurrentVersion: true }
    });
    
    if (prevVersion) {
      // Mark previous version as not current
      await prevVersion.update({ IsCurrentVersion: false, Active: false });
      // Extract version number from previous version
      const versionMatch = prevVersion.VersionNumber.match(/v(\d+)/);
      if (versionMatch) {
        versionNumber = `v${parseInt(versionMatch[1]) + 1}`;
      }
    }

    console.log('Version Number:', versionNumber);

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

    await db.DocumentVersions.create({
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
    const {
       Text1, Date1, Text2, Date2, Text3, Date3,
      Text4, Date4, Text5, Date5, Text6, Date6, Text7, Date7,
      Text8, Date8, Text9, Date9, Text10, Date10,
      expiration, confidential, expdate, remarks, id, dep, subdep, publishing_status,FileDescription,
      Description,filename
    } = req.body;
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
    
const documentbypk=await db.Documents.findByPk(documentID)
    const linkid=documentbypk.LinkID
   

    await db.Documents.update(
      { Active: false },
      { where: { LinkID: linkid } }
    );

    await logAuditTrail(documentID, 'DOCUMENT_REMOVED', req.user.id, "deleted", null, req, linkid);

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

router.get('/convert-to-pdfa/:attachmentID', async (req, res) => {
  try {
    const { attachmentID } = req.params;
    
    const attachment = await Attachment.findByPk(parseInt(attachmentID));
    if (!attachment || !attachment.DataImage) {
      req.session.error = 'Attachment not found or invalid.';
      return res.redirect('/documents');
    }

    const ghostscriptPath = 'C:\\Program Files\\gs\\gs10.04.0\\bin\\gswin64c.exe';
    if (!fs.existsSync(ghostscriptPath)) {
      req.session.error = 'Ghostscript is not installed or not found at the specified path.';
      return res.redirect('/documents');
    }

    // Create temporary files
    const tempInputPath = path.join(__dirname, 'temp', `input_${Date.now()}.pdf`);
    const tempOutputPath = path.join(__dirname, 'temp', `output_${Date.now()}.pdf`);
    
    // Ensure temp directory exists
    const tempDir = path.dirname(tempInputPath);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Write input file
    fs.writeFileSync(tempInputPath, attachment.DataImage);

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
    
    ghostscript.on('close', (code) => {
      try {
        if (code !== 0 || !fs.existsSync(tempOutputPath)) {
          console.log(`Ghostscript failed with exit code ${code}`);
          req.session.error = 'Failed to convert the file to PDF/A format.';
          return res.redirect('/documents');
        }

        const convertedBytes = fs.readFileSync(tempOutputPath);
        const fileName = `${path.parse(attachment.DataName).name} (PDF/A).pdf`;

        // Cleanup temp files
        if (fs.existsSync(tempInputPath)) fs.unlinkSync(tempInputPath);
        if (fs.existsSync(tempOutputPath)) fs.unlinkSync(tempOutputPath);

        res.set({
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${fileName}"`
        });
        res.send(convertedBytes);
      } catch (error) {
        console.error('Error in ghostscript close handler:', error);
        req.session.error = `An error occurred during the conversion: ${error.message}`;
        res.redirect('/documents');
      }
    });

    ghostscript.on('error', (error) => {
      console.error('Ghostscript error:', error);
      req.session.error = `An error occurred during the conversion: ${error.message}`;
      res.redirect('/documents');
    });

  } catch (error) {
    console.error('Error converting to PDF/A:', error);
    req.session.error = `An error occurred during the conversion: ${error.message}`;
    res.redirect('/documents');
  }
});





router.get('/documents/:userid', async (req, res) => {
  try {
    const { userId, page = 1, limit = 10, search = '', status = 'all' } = req.query;
    const {userid}=req.params
    const offset = (page - 1) * limit;

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
    const user=await db.Users.findOne({
      where:{ID:userid},
       
    })
    let userAccess=[]
    try{
      userAccess=JSON.parse(user.userAccessArray)
    }catch(e){}
    const approvers=await db.DocumentApprovers.findAll({})
    const restrictionIds = restrictions.map(r => r.DocumentID);
    console.log("restrictions",restrictions)
    const documents = await db.Documents.findAndCountAll({
      where: whereClause,
      // include: [
      //   {
      //     model: DocumentVersionsModel,
      //     as: 'versions',
      //     where: { IsCurrentVersion: true },
      //     required: false
      //   },
      //   {
      //     model: DocumentCollaborationsModel,
      //     as: 'collaborations',
      //     where: { Active: true },
      //     required: false
      //   },
      //   {
      //     model: DocumentApprovalsModel,
      //     as: 'approvals',
      //     where: { Status: 'PENDING' },
      //     required: false
      //   }
      // ],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['CreatedDate', 'DESC']]
    });
    const newdocuments = documents.rows.map(async doc => {
      const LinkID=doc.LinkID
      const versions= await db.DocumentVersions.findOne({
        where: { LinkID: LinkID },
        order: [['ModificationDate', 'DESC']]
      });
     const doc_under_approvalof = approvers.find(e =>
        e.DepartmentId === doc.DepartmentId && e.SubDepartmentId === doc.SubDepartmentId
      );
      const approval=await db.DocumentApprovals.findOne({
        where:{
          LinkID:doc.LinkID,
          RequestedBy:userid
        }
      })
      const shoulduserbeallowedtoapproverequest=doc_under_approvalof?true:false
      const isRestricted = restrictionIds.includes(doc.ID+"");
      const newdoc=JSON.parse(JSON.stringify(doc))
      delete newdoc.DataImage
      newdoc.approval=approval
       newdoc.approvalstatus=false
       if(approval && approval.Status=="1"){
        newdoc.approvalstatus=true
      }
      return {
        newdoc,
        isRestricted: isRestricted,
        versions:versions,
        restrictions: isRestricted ? restrictions.filter(r => r.DocumentID === doc.ID) : []
      };

    })
    Promise.all(newdocuments).then(newdocuments => {
      res.status(200).json({
        success: true,
        data: {
          documents: newdocuments,
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(documents.count / limit),
            totalItems: documents.count,
            itemsPerPage: parseInt(limit)
          }
        }
      });
    })

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
    const offset = (page - 1) * limit;

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
    console.log("restr",restrictions)
    const restrictionIds = restrictions.map(r => r.DocumentID);
    // console.log("restrictions",restrictions)
    const documents = await db.Documents.findAndCountAll({
      where: whereClause,
    
      
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['CreatedDate', 'DESC']]
    });
    const OCRDocumentReadFields = await db.OCRDocumentReadFields.findAll({
     
      raw: true
    });
    const templatemodels=await db.Template.findAll({raw:true})
    const newdocuments = documents.rows.map(async doc => {
       const buffer = doc.DataImage; // e.g., from req.file.buffer or a DB BLOB
        console.log("doc",doc)
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
          currentPage: parseInt(page),
          totalPages: Math.ceil(documents.count / limit),
          totalItems: documents.count,
          itemsPerPage: parseInt(limit)
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
    const offset = (page - 1) * limit;

    const whereClause = buildWhereClause(search);

    // Fetch user-specific restrictions
    const restrictions = await db.DocumentRestrictions.findAll({
      where: { UserID: userid },
      raw: true
    });
    const restrictedIds = restrictions.map(r => r.DocumentID);

    // Fetch documents
    const documents = await db.Documents.findAndCountAll({
      where: whereClause,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['CreatedDate', 'DESC']]
    });

    // Supporting data
    const OCRDocumentReadFields = await db.OCRDocumentReadFields.findAll({ raw: true,order: [['CreatedAt', 'DESC']]}) // or 'create });
    const templates = await db.Template.findAll({ raw: true });

    const processedDocs = await Promise.all(
      documents.rows.map(async doc =>
        await processDocument(doc, restrictions, OCRDocumentReadFields, templates)
      )
    );

    return res.status(200).json({
      success: true,
      data: {
        documents: processedDocs,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(documents.count / limit),
          totalItems: documents.count,
          itemsPerPage: parseInt(limit)
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

router.get('/documents/:documentId/analytics',requireAuth, async (req, res) => {
  try {
    const { documentId } = req.params;
    const  userId  = req.user.id;
    const latestestdocument=await db.Documents.findByPk(documentId)
    const LinkID=latestestdocument.LinkID
    const document = await db.Documents.findOne({
      where: { LinkID: LinkID, Active: true },
      // include: [
      //   { model: db.DocumentVersions, as: 'versions', required: false },
      //   // { model: db.DocumentCollaborations, as: 'collaborations', where: { Active: true }, required: false },
      //   // { model: db.DocumentComments, as: 'comments', where: { Active: true }, required: false },
      //   // { model: db.DocumentApprovals, as: 'approvals', where: { Active: true }, required: false },
      //   // { model: db.DocumentRestrictions, as: 'restrictions', where: { Active: true }, required: false }
      // ]
    });
   

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    // Log view activity
    await logAuditTrail(documentId, 'VIEWED', req.user.id, null, null, req, LinkID);
    await logCollaboratorActivity(documentId, req.user.id, 'DOCUMENT_OPENED', req,null,LinkID);
    const versions= await db.DocumentVersions.findAll({
          where: { LinkID: LinkID },
          order: [['ModificationDate', 'DESC']]
        });

    const OCRDocumentReadFields = await db.OCRDocumentReadFields.findAll({
      where: { LinkID: LinkID },
      raw :true    });
      console.log("OCRDocumentReadFields",OCRDocumentReadFields)
    const collaborations = await db.DocumentCollaborations.findAll({
      where: { LinkID: LinkID },
      include: [
        {
          model: db.Users,
          as: 'Collaborator',
          
        },
        {
          model: db.CollaboratorActivities,
          as: 'Activities',
          // where: { Active: true },
          required: false
        }
      ]
      // order: [['AddedDate', 'DESC']]
    });
    
    const comments = await db.DocumentComments.findAll({
      where: { LinkID: LinkID },
      include:[
        {
          model: db.Users,
          as: 'commenter',
          
        }
      ],
      order: [['CommentDate', 'DESC']]
    });
    const auditTrails = await db.DocumentAuditTrail.findAll({
      where: { LinkID: LinkID },
      include: [
        {
          model: db.Users,
          as: 'actor',
          attributes: ['id', 'userName']
        }
      ],
      order: [['ActionDate', 'DESC']]
    });
    const restrictions = await db.DocumentRestrictions.findAll({
      where: { LinkID: LinkID,UserID:userId },
      order: [['CreatedDate', 'DESC']]
    });
    const updatedArray = OCRDocumentReadFields.map(item => {
      const match = restrictions.find(el => el.Field === item.Field);
      console.log("match",match,"item",item)
      const newitem=JSON.parse(JSON.stringify(item));
      if(match){
        newitem.Restricted = true
      }
      else{
        newitem.Restricted = false
      }
      return newitem;
    });

    const user=await db.Users.findOne({
    where:{ID:req.user.id},
      
    })
    let userAccess=[]
    try{
      userAccess=JSON.parse(user.userAccessArray)
    }catch(e){}
    console.log("useraccess array",userAccess)
    const approvers=await db.DocumentApprovers.findAll({raw:true})
    console.log("approvers",approvers)
    const approversaccess=approvers.filter(e=>{
      if(userAccess.includes(parseInt(e.ApproverID))){
        return e
      }
    })
      console.log("approversaccess",approversaccess)
      const accessforthisdoc=approversaccess.find(e =>
        e.DepartmentId === document.DepartmentId && e.SubDepartmentId === document.SubDepartmentId
      );
      
      console.log("accessforthisdoc",accessforthisdoc)
    const approvalsforthisdoc=await db.DocumentApprovals.findAll({
            where:{
              LinkID:document.LinkID
            }
            ,raw:true
          })
          console.log("accessforthisdoc",accessforthisdoc)
    const approvalsforusertoacceptorreject=accessforthisdoc?approvalsforthisdoc:[]
    const templates = await db.Template.findAll({ raw: true });
    const processedDocs = await Promise.all(
      [document].map(async doc =>
        await processDocument(doc, restrictions, OCRDocumentReadFields, templates)
      )
    );
    
    const docwith={
      document:processedDocs,
      versions:versions,
      collaborations:collaborations,
      comments:comments,
      auditTrails:auditTrails,
      restrictions:restrictions,
      OCRDocumentReadFields:updatedArray,
      approvalsforusertoacceptorreject:approvalsforusertoacceptorreject
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

// CREATE - Request approval
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
router.get('/documents/:documentId/approvals', async (req, res) => {
  try {
    const { documentId } = req.params;
    const doc=await db.Documents.findByPk(documentId)
    const linkid=doc.LinkID
    const approvals = await db.DocumentApprovals.findAll({
      where: { LinkID: linkid },
      order: [['RequestedDate', 'DESC']]
    });

    res.status(200).json({
      success: true,
      data: approvals
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

// UPDATE - Approve/Reject
router.put('/documents/:documentId/approvals/:approvalId', requireAuth,async (req, res) => {
  try {
    const { documentId, approvalId } = req.params;
    const { status, comments, rejectionReason, approverId } = req.body;

    const oldApproval = await db.DocumentApprovals.findByPk(approvalId);
const documentbypk=await db.Documents.findByPk(documentId)
    const linkid=documentbypk.LinkID
    await db.DocumentApprovals.update({
      Status: status,
      ApprovalDate: new Date(),
      ApproverID:req.user.id,
      ApproverName:req.user.userName,
      Comments: comments,
      RejectionReason: rejectionReason
    }, {
      where: { ID: approvalId }
    });

    const updatedApproval = await db.DocumentApprovals.findByPk(approvalId);

    const action = status === 'APPROVED' ? 'APPROVED' : 'REJECTED';
    await logAuditTrail(documentId, action, approverId, oldApproval?.toJSON(), updatedApproval?.toJSON(), req,linkid);

    res.status(200).json({
      success: true,
      message: `Document ${status.toLowerCase()} successfully`,
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
});
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
    const approvers = await DocumentApprovers.findAll();
    return res.status(200).json({
      status:true,
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
    const { DepartmentId, SubDepartmentId, ApproverID } = req.body;
    const newApprover = await DocumentApprovers.create({ DepartmentId, SubDepartmentId, ApproverID });
      return res.status(200).json({
      status:true,
      approver:newApprover
    });
    res.status(201).json(newApprover);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 👉 UPDATE existing approver
router.put('/document-approvers/:id', async (req, res) => {
  try {
    const { DepartmentId, SubDepartmentId, ApproverID } = req.body;
    const approver = await DocumentApprovers.findByPk(req.params.id);
    if (!approver) return res.status(404).json({ message: 'Approver not found' });

    await approver.update({ DepartmentId, SubDepartmentId, ApproverID });
      return res.status(200).json({
      status:true,
      approver:approver
    });
    // res.status(200).json(approver);
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