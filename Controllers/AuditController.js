const express = require('express');
const { Op } = require('sequelize');
const router = express.Router();
const db = require('../config/database');

// POST /audit/activity - Log audit activity
router.post('/activity', async (req, res) => {
  try {
    // ⚡ FIX: Check if model exists
    if (!db.AuditActivities) {
      console.error('AuditActivities model not found in db object');
      return res.status(500).json({
        success: false,
        message: 'AuditActivities model not initialized',
        error: 'Model not found in database configuration'
      });
    }

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

    // ⚡ FIX: Check if user exists to avoid foreign key constraint error
    // If user doesn't exist, we'll log a warning but still try to insert
    // (This assumes the foreign key constraint will be removed or made optional)
    try {
      if (db.Users) {
        const userExists = await db.Users.findByPk(userId);
        if (!userExists) {
          console.warn(`⚠️ WARNING: User ID ${userId} does not exist in Users table.`);
          console.warn(`   This will cause a foreign key constraint error if the constraint exists.`);
          console.warn(`   Solution: Run the SQL script to remove the foreign key constraint.`);
        }
      }
    } catch (userCheckError) {
      console.warn('Could not verify user existence:', userCheckError.message);
    }

    // Create audit activity record
    // Note: Model's setter will automatically handle JSON stringification for metadata
    // ⚡ FIX: Use raw query to bypass foreign key constraint if needed
    // This is a workaround until the foreign key constraint is removed
    let auditActivity;
    try {
      auditActivity = await db.AuditActivities.create({
        action,
        user_id: userId,
        user_name: userName,
        document_id: documentId || null,
        document_name: documentName || null,
        details: details || null,
        metadata: metadata || null, // Model setter will handle JSON conversion
        timestamp: timestamp ? new Date(timestamp) : new Date(),
        ip_address: ipAddress || req.ip,
        user_agent: userAgent || req.get('User-Agent')
      });
    } catch (fkError) {
      // If foreign key constraint error, the database constraint will still block it
      // The best solution is to remove the foreign key constraint from the database
      // See: scripts/fix_audit_activities_foreign_key.sql
      if (fkError.name === 'SequelizeForeignKeyConstraintError') {
        console.error('❌ Foreign key constraint error:');
        console.error(`   User ID ${userId} does not exist in Users table.`);
        console.error('   Solution: Run this SQL to remove the foreign key constraint:');
        console.error('   ALTER TABLE `audit_activities` DROP FOREIGN KEY `audit_activities_ibfk_1`;');
        throw new Error(`User ID ${userId} does not exist. Please remove the foreign key constraint or ensure the user exists.`);
      } else {
        throw fkError; // Re-throw if it's a different error
      }
    }

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
    console.error('❌ Error logging audit activity:', error);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('Request body:', JSON.stringify(req.body, null, 2));
    
    // Check for common database errors
    let errorMessage = 'Failed to log activity';
    let errorDetails = {};
    
    if (error.name === 'SequelizeDatabaseError') {
      if (error.message.includes("doesn't exist") || error.message.includes("Unknown table")) {
        errorMessage = 'Database table "audit_activities" does not exist. Please create the table first.';
        errorDetails.tableError = true;
        errorDetails.sqlMessage = error.message;
      } else if (error.message.includes("Unknown column")) {
        errorMessage = 'Database table structure mismatch. Please check table columns.';
        errorDetails.columnError = true;
        errorDetails.sqlMessage = error.message;
      }
    } else if (error.name === 'SequelizeValidationError') {
      errorMessage = 'Validation error: ' + error.errors.map(e => e.message).join(', ');
      errorDetails.validationErrors = error.errors;
    }
    
    res.status(500).json({
      success: false,
      message: errorMessage,
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? {
        name: error.name,
        message: error.message,
        ...errorDetails,
        stack: error.stack?.split('\n').slice(0, 5).join('\n') // First 5 lines of stack
      } : undefined
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

// GET /audit/user-activities - Get audit activities with date filtering
router.get('/user-activities', async (req, res) => {
  try {
    const { page = 1, limit = 50, documentId, userId, action, startDate, endDate } = req.query;
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

    // Add date filtering
    if (startDate || endDate) {
      whereClause.timestamp = {};
      if (startDate) {
        whereClause.timestamp[Op.gte] = new Date(startDate);
      }
      if (endDate) {
        whereClause.timestamp[Op.lte] = new Date(endDate);
      }
    }

    const activities = await db.AuditActivities.findAndCountAll({
      where: whereClause,
      order: [['timestamp', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.status(200).json({
      success: true,
      data: activities.rows,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(activities.count / limit),
        totalItems: activities.count,
        itemsPerPage: parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Error fetching user activities:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching user activities',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

module.exports = router;
