const express = require('express');
const { Sequelize, DataTypes } = require('sequelize');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();
// const { SubDepartment } = require("../models");
const db = require('../config/database'); 
const SubDepartment = db.SubDepartment
const { Op } = require("sequelize");

const requireAuth=require("../middleware/requireAuth")
// Setup Sequelize (adjust connection as needed)


// Define Template model
const Template = db.Template;

// added
// Ensure uploads folder exists
const UPLOAD_DIR = path.join(__dirname, '../public/images/templates');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Multer setup for PDF uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});
const upload = multer({
  storage,
  // fileFilter: (req, file, cb) => {
  //   if (file.mimetype === 'application/pdf') cb(null, true);
  //   else cb(new Error('Only PDF files are allowed'));
  // },
});



// Create Template
router.post('/', upload.single('samplePdf'), async (req, res) => {
  try {
    let { name, departmentId, subDepartmentId, imageWidth, imageHeight, fields, header } = req.body;

    // Parse fields if it's a string
    if (typeof fields === 'string') fields = JSON.parse(fields);

    const samplePdfPath = req.file ? req.file.path : null;
    const filename=req.file.filename
    // Check if a template with the same name already exists
    const existing = await db.Template.findOne({ where: { name } });
    console.log("exi",existing)
    if (existing) {
      return res.status(409).json({ error: 'Template name must be unique' });
    }

    const template = await db.Template.create({
      name,
      departmentId,
      subDepartmentId,
      imageWidth,
      imageHeight,
      header,
      samplePdfPath:filename,
      fields,
    });

    res.status(201).json(template);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
});


// List Templates (optional filter)
router.get('/', async (req, res) => {
try {
  const { departmentId, subDepartmentId } = req.query;
  const where = {};
  if (departmentId) where.departmentId = departmentId;
  if (subDepartmentId) where.subDepartmentId = subDepartmentId;

  // Only return active templates
  where.active = 1;

  const templates = await Template.findAll({
    where,
    include: [
      { model: db.Department, attributes: ['ID', 'Name'] },
      { model: db.SubDepartment, attributes: ['ID', 'Name'] }
    ]
  });

  res.json(templates);
} catch (err) {
  console.error(err);
  res.status(500).json({ error: err.message });
}

});

// Get Template by ID
router.get('/:id', async (req, res) => {
  try {
    const template = await Template.findOne({where:{ID:req.params.id, active: 1}, include: [
      { model: db.Department, attributes: ['ID', 'Name'] },
      { model: db.SubDepartment, attributes: ['ID', 'Name'] }
    ]});
    if (!template) return res.status(404).json({ error: 'Template not found' });
    res.json(template);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Update Template
router.put('/:id', upload.single('samplePdf'), async (req, res) => {
  try {
    const template = await Template.findByPk(req.params.id);
    if (!template) return res.status(404).json({ error: 'Template not found' });
    const samplePdfPath = req.file ? req.file.path : null;
    const filename=req?.file?.filename
    let { name, departmentId, subDepartmentId, imageWidth, imageHeight, fields,header } = req.body;

    if (typeof fields === 'string') fields = JSON.parse(fields);

    if (name !== undefined) template.name = name;
    if (departmentId !== undefined) template.departmentId = departmentId;
    if (subDepartmentId !== undefined) template.subDepartmentId = subDepartmentId;
    if (imageWidth !== undefined) template.imageWidth = imageWidth;
    if (imageHeight !== undefined) template.imageHeight = imageHeight;
    if (fields !== undefined) template.fields = fields;
    if (req.file) template.samplePdfPath = filename;
    if (header !== undefined) template.header = header;
    await template.save();
    res.json(template);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
});

// Delete Template
router.delete('/:id', async (req, res) => {
  try {
    const template = await Template.findByPk(req.params.id);
    if (!template) return res.status(404).json({ error: 'Template not found' });

    // Optionally delete PDF file from disk
    if (template.samplePdfPath && fs.existsSync(template.samplePdfPath)) {
      fs.unlinkSync(template.samplePdfPath);
    }

    const [updated] = await Template.update(
      { active: 0 },
      { where: { ID: req.params.id } }
    );
    if (updated === 0) return res.status(500).json({ error: 'Failed to delete template' });
    res.json({ message: 'Template deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;