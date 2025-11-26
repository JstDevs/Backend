const express = require('express');
const router = express.Router();
const db = require('../config/database');

// Routes for Fields table
// GET fields by LinkID - supports both path param and query param

// Path parameter: /fields/by-link/:id
router.get('/by-link/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { includeInactive } = req.query;
    const where = { LinkID: id };
    if (includeInactive !== 'true') {
      where.Active = true;
    }
    const fields = await db.Fields.findAll({
      where,
      include: [{
        model: db.OCRavalibleFields,
        attributes: ['ID', 'Field'],
        required: false,  // LEFT JOIN - allow fields without master link
        as: 'MasterField'
      }],
      order: [['FieldNumber', 'ASC']]
    });
    
    // Map response to include FieldID and MasterField clearly
    const mappedFields = fields.map(f => {
      const fieldData = f.toJSON();
      return {
        ...fieldData,
        FieldID: fieldData.FieldID || fieldData.MasterField?.ID || null,
        MasterField: fieldData.MasterField?.Field || null
      };
    });
    
    res.json({ status: true, data: mappedFields });
  } catch (error) {
    console.error('Error fetching fields by link:', error);
    res.status(500).json({ status: false, error: 'Failed to fetch fields by link' });
  }
});

// Query parameter: /fields/by-link?linkId=123
router.get('/by-link', async (req, res) => {
  try {
    const { linkId, includeInactive } = req.query;
    if (!linkId) {
      return res.status(400).json({ status: false, error: 'Missing linkId parameter' });
    }
    const where = { LinkID: linkId };
    if (includeInactive !== 'true') {
      where.Active = true;
    }
    const fields = await db.Fields.findAll({
      where,
      include: [{
        model: db.OCRavalibleFields,
        attributes: ['ID', 'Field'],
        required: false,  // LEFT JOIN - allow fields without master link
        as: 'MasterField'
      }],
      order: [['FieldNumber', 'ASC']]
    });
    
    // Map response to include FieldID and MasterField clearly
    const mappedFields = fields.map(f => {
      const fieldData = f.toJSON();
      return {
        ...fieldData,
        FieldID: fieldData.FieldID || fieldData.MasterField?.ID || null,
        MasterField: fieldData.MasterField?.Field || null
      };
    });
    
    res.json({ status: true, data: mappedFields });
  } catch (error) {
    console.error('Error fetching fields by link (query):', error);
    res.status(500).json({ status: false, error: 'Failed to fetch fields by link' });
  }
});

// BULK UPSERT fields by LinkID
// PUT /fields/by-link/:id
// Body: { fields: [{ FieldNumber, Active, Description, DataType, FieldID }, ...], deactivateMissing?: boolean }
router.put('/by-link/:id', async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const { id } = req.params;
    const { fields, deactivateMissing } = req.body || {};

    if (!Array.isArray(fields)) {
      await transaction.rollback();
      return res.status(400).json({ status: false, error: 'Body must include an array "fields"' });
    }

    // Normalize and validate items
    const normalized = fields.map(item => {
      // Handle FieldID: convert to number if valid, otherwise null
      let fieldID = null;
      if (item.FieldID !== undefined && item.FieldID !== null && item.FieldID !== '') {
        const parsedID = Number(item.FieldID);
        if (Number.isFinite(parsedID) && parsedID > 0) {
          fieldID = parsedID;
        }
      }
      
      return {
        LinkID: Number(id),
        FieldNumber: Number(item.FieldNumber),
        Active: item.Active === true || item.Active === 1 || item.Active === '1' || item.Active === 'true',
        FieldID: fieldID,  // Accept FieldID from payload (nullable)
        Description: typeof item.Description === 'string' ? item.Description : null,
        DataType: item.DataType === 'Date' ? 'Date' : 'Text' // default to Text
      };
    }).filter(x => Number.isFinite(x.FieldNumber));

    if (normalized.length === 0) {
      await transaction.rollback();
      return res.status(400).json({ status: false, error: 'No valid field items provided' });
    }

    // Optional: deactivate fields not present in payload
    if (deactivateMissing === true) {
      const providedNumbers = normalized.map(n => n.FieldNumber);
      await db.Fields.update(
        { Active: false },
        { where: { LinkID: id, FieldNumber: { [db.Sequelize.Op.notIn]: providedNumbers } }, transaction }
      );
    }

    // Upsert each row by composite key (LinkID + FieldNumber)
    for (const item of normalized) {
      const existing = await db.Fields.findOne({ where: { LinkID: item.LinkID, FieldNumber: item.FieldNumber }, transaction });
      if (existing) {
        // Build update object, only include FieldID if it has a value
        const updateData = {
          Active: item.Active, 
          Description: item.Description, 
          DataType: item.DataType
        };
        // Only include FieldID if it's not null
        if (item.FieldID !== null && item.FieldID !== undefined) {
          updateData.FieldID = item.FieldID;
        }
        await existing.update(updateData, { transaction });
      } else {
        // Build create object, exclude FieldID if it's null
        const createData = {
          LinkID: item.LinkID,
          FieldNumber: item.FieldNumber,
          Active: item.Active,
          Description: item.Description,
          DataType: item.DataType
        };
        // Only include FieldID if it has a value (database doesn't allow NULL)
        if (item.FieldID !== null && item.FieldID !== undefined) {
          createData.FieldID = item.FieldID;
        }
        await db.Fields.create(createData, { transaction });
      }
    }

    await transaction.commit();

    // Return updated list (all, ordered)
    const updated = await db.Fields.findAll({
      where: { LinkID: id },
      order: [['FieldNumber', 'ASC']]
    });

    return res.json({ status: true, data: updated });
  } catch (error) {
    console.error('Error updating fields by link:', error);
    console.error('Error details:', error.message);
    console.error('Error stack:', error.stack);
    try { await transaction.rollback(); } catch (rollbackError) {
      console.error('Rollback error:', rollbackError);
    }
    return res.status(500).json({ 
      status: false, 
      error: 'Failed to update fields by link',
      details: error.message 
    });
  }
});

// Alternative: POST with body linkId
// POST /fields/by-link
// Body: { linkId: number, fields: [...] }
router.post('/by-link', async (req, res) => {
  const { linkId } = req.body || {};
  if (!linkId) {
    return res.status(400).json({ status: false, error: 'Missing linkId in body' });
  }
  req.params.id = linkId; // reuse handler logic
  return router.handle({ ...req, method: 'PUT', url: `/by-link/${linkId}` }, res, () => {});
});

module.exports = router;

