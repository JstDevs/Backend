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
      order: [['FieldNumber', 'ASC']]
    });
    res.json({ status: true, data: fields });
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
      order: [['FieldNumber', 'ASC']]
    });
    res.json({ status: true, data: fields });
  } catch (error) {
    console.error('Error fetching fields by link (query):', error);
    res.status(500).json({ status: false, error: 'Failed to fetch fields by link' });
  }
});

module.exports = router;

