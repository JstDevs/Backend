const express = require('express');
const router = express.Router();
const db = require('../config/database');

// POST /audit/activity - Log audit activity
router.post('/activity', async (req, res) => {
  try {
    const {
      action,
      userId,
      userName,
      documentId,
      documentName,
      details,
      metadata,
      timestamp,
      ipAddress,
      userAgent
    } = req.body;

    // Validate required fields
    if (!action || !userId || !userName) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: action, userId, userName'
      });
    }

    // Create audit activity record
    const auditActivity = await db.AuditActivities.create({
      action,
      user_id: userId,
      user_name: userName,
      document_id: documentId || null,
      document_name: documentName || null,
      details: details || null,
      metadata: metadata || null,
      timestamp: timestamp ? new Date(timestamp) : new Date(),
      ip_address: ipAddress || req.ip,
      user_agent: userAgent || req.get('User-Agent')
    });

    res.status(201).json({
      success: true,
      message: 'Activity logged successfully',
      data: {
        id: auditActivity.ID,
        action: auditActivity.action,
        timestamp: auditActivity.timestamp
      }
    });

  } catch (error) {
    console.error('Error logging audit activity:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to log activity',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// GET /audit/activities - Get audit activities (optional endpoint for debugging)
router.get('/activities', async (req, res) => {
  try {
    const { page = 1, limit = 50, documentId, userId, action } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = {};
    
    if (documentId) {
      whereClause.document_id = documentId;
    }
    
    if (userId) {
      whereClause.user_id = userId;
    }
    
    if (action) {
      whereClause.action = action;
    }

    const activities = await db.AuditActivities.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: db.Users,
          as: 'user',
          attributes: ['ID', 'userName', 'email']
        },
        {
          model: db.Documents,
          as: 'document',
          attributes: ['ID', 'FileName', 'LinkID'],
          required: false
        }
      ],
      order: [['timestamp', 'DESC']],
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
    console.error('Error fetching audit activities:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching audit activities',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

module.exports = router;
