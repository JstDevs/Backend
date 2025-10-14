// controllers/documentController.js
const express = require('express');
const router = express.Router();
const db=require("../config/database")
// Import models
const DocumentsModel =db.DocumentsModel
const DocumentVersionsModel = db.DocumentVersionsModel
const DocumentCollaborationsModel =db.DocumentCollaborationsModel
const DocumentCommentsModel = db.DocumentCommentsModel
const DocumentApprovalsModel = db.DocumentApprovalsModel
const DocumentAuditTrailModel = db.DocumentAuditTrailModel
const DocumentRestrictionsModel = db.DocumentRestrictionsModel
const CollaboratorActivitiesModel = db.CollaboratorActivitiesModel;

// GET - Comprehensive Document Details with all related data
router.get('/documents/:documentId/complete', async (req, res) => {
  try {
    const { documentId } = req.params;
    const { userId, userRole } = req.query; // Get current user info from query params

    // Fetch main document with all related data
    const documentData = await DocumentsModel.findOne({
      where: { 
        ID: documentId,
        Active: true 
      },
      include: [
        {
          model: DocumentVersionsModel,
          as: 'versions',
          where: { Active: true },
          required: false,
          order: [['VersionNumber', 'DESC']]
        },
        {
          model: DocumentCollaborationsModel,
          as: 'collaborations',
          where: { Active: true },
          required: false
        },
        {
          model: DocumentCommentsModel,
          as: 'comments',
          where: { Active: true },
          required: false,
          include: [
            {
              model: DocumentCommentsModel,
              as: 'replies',
              where: { Active: true },
              required: false
            }
          ],
          order: [['CommentDate', 'DESC']]
        },
        {
          model: DocumentApprovalsModel,
          as: 'approvals',
          where: { Active: true },
          required: false,
          order: [['RequestedDate', 'DESC']]
        },
        {
          model: DocumentRestrictionsModel,
          as: 'restrictions',
          where: { 
            Active: true,
            $or: [
              { UserID: userId },
              { UserRole: userRole },
              { UserID: null, UserRole: null } // Global restrictions
            ]
          },
          required: false
        }
      ]
    });

    if (!documentData) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    // Get audit trail separately (can be large)
    const auditTrail = await DocumentAuditTrailModel.findAll({
      where: { DocumentID: documentId },
      order: [['ActionDate', 'DESC']],
      limit: 50 // Limit to recent 50 entries
    });

    // Get collaborator activities
    const collaboratorActivities = await CollaboratorActivitiesModel.findAll({
      where: { DocumentID: documentId },
      order: [['ActivityDate', 'DESC']],
      limit: 100
    });

    // Process restrictions to determine user permissions
    const userRestrictions = documentData.restrictions || [];
    const restrictedFields = [];
    const allowedActions = ['read']; // Default
    const deniedActions = [];

    userRestrictions.forEach(restriction => {
      if (restriction.RestrictedFields) {
        restrictedFields.push(...restriction.RestrictedFields);
      }
      if (restriction.AllowedActions) {
        allowedActions.push(...restriction.AllowedActions);
      }
      if (restriction.DeniedActions) {
        deniedActions.push(...restriction.DeniedActions);
      }
    });

    // Filter document data based on restrictions
    const filteredDocument = { ...documentData.toJSON() };
    restrictedFields.forEach(field => {
      if (filteredDocument[field]) {
        filteredDocument[field] = '[RESTRICTED]';
      }
    });

    // Get collaboration summary
    const collaborationSummary = {
      totalCollaborators: documentData.collaborations?.length || 0,
      activeCollaborators: documentData.collaborations?.filter(c => c.LastActivity && 
        new Date(c.LastActivity) > new Date(Date.now() - 24 * 60 * 60 * 1000)).length || 0,
      permissionBreakdown: {}
    };

    documentData.collaborations?.forEach(collab => {
      const level = collab.PermissionLevel;
      collaborationSummary.permissionBreakdown[level] = 
        (collaborationSummary.permissionBreakdown[level] || 0) + 1;
    });

    // Get comments summary
    const commentsSummary = {
      totalComments: documentData.comments?.length || 0,
      unresolvedComments: documentData.comments?.filter(c => !c.IsResolved).length || 0,
      recentComments: documentData.comments?.filter(c => 
        new Date(c.CommentDate) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)).length || 0
    };

    // Get approval summary
    const approvalsSummary = {
      totalApprovals: documentData.approvals?.length || 0,
      pendingApprovals: documentData.approvals?.filter(a => a.Status === 'PENDING').length || 0,
      approvedCount: documentData.approvals?.filter(a => a.Status === 'APPROVED').length || 0,
      rejectedCount: documentData.approvals?.filter(a => a.Status === 'REJECTED').length || 0
    };

    // Get version summary
    const versionsSummary = {
      totalVersions: documentData.versions?.length || 0,
      currentVersion: documentData.versions?.find(v => v.IsCurrentVersion)?.VersionNumber || '1.0',
      lastModified: documentData.versions?.[0]?.ModificationDate || documentData.CreatedDate,
      lastModifiedBy: documentData.versions?.[0]?.ModifiedBy || documentData.Createdby
    };

    // Log this access in audit trail
    await DocumentAuditTrailModel.create({
      DocumentID: documentId,
      Action: 'VIEWED',
      ActionBy: userId || 'ANONYMOUS',
      ActionDate: new Date(),
      IPAddress: req.ip,
      UserAgent: req.get('User-Agent'),
      Description: 'Document accessed via complete details API'
    });

    // Record collaborator activity if user is a collaborator
    const isCollaborator = documentData.collaborations?.some(c => c.CollaboratorID === userId);
    if (isCollaborator) {
      await CollaboratorActivitiesModel.create({
        DocumentID: documentId,
        CollaboratorID: userId,
        ActivityType: 'DOCUMENT_OPENED',
        ActivityDate: new Date(),
        IPAddress: req.ip,
        DeviceInfo: req.get('User-Agent')
      });
    }

    // Prepare response
    const response = {
      success: true,
      data: {
        document: filteredDocument,
        userPermissions: {
          restrictedFields: [...new Set(restrictedFields)],
          allowedActions: [...new Set(allowedActions)],
          deniedActions: [...new Set(deniedActions)],
          isCollaborator,
          canComment: allowedActions.includes('comment') || allowedActions.includes('write'),
          canEdit: allowedActions.includes('write') && !deniedActions.includes('write'),
          canApprove: allowedActions.includes('approve'),
          canDownload: allowedActions.includes('download') && !deniedActions.includes('download')
        },
        summaries: {
          collaboration: collaborationSummary,
          comments: commentsSummary,
          approvals: approvalsSummary,
          versions: versionsSummary
        },
        recentAuditTrail: auditTrail.slice(0, 10), // Latest 10 entries
        recentActivities: collaboratorActivities.slice(0, 20), // Latest 20 activities
        metadata: {
          totalAuditEntries: auditTrail.length,
          totalActivities: collaboratorActivities.length,
          lastAccessed: new Date(),
          accessedBy: userId
        }
      }
    };

    res.status(200).json(response);

  } catch (error) {
    console.error('Error fetching complete document data:', error);
    
    // Log error in audit trail
    try {
      await DocumentAuditTrailModel.create({
        DocumentID: req.params.documentId,
        Action: 'ERROR',
        ActionBy: req.query.userId || 'SYSTEM',
        ActionDate: new Date(),
        Description: `Error accessing document: ${error.message}`,
        AdditionalData: { error: error.stack }
      });
    } catch (auditError) {
      console.error('Failed to log error in audit trail:', auditError);
    }

    res.status(500).json({
      success: false,
      message: 'Error fetching document data',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// GET - Document Management Dashboard (Summary of all documents)
router.get('/documents/dashboard', async (req, res) => {
  try {
    const { userId, userRole, page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    // Get documents accessible to user
    const documents = await DocumentsModel.findAndCountAll({
      where: { Active: true },
      include: [
        {
          model: DocumentCollaborationsModel,
          as: 'collaborations',
          where: { 
            Active: true,
            CollaboratorID: userId 
          },
          required: false
        },
        {
          model: DocumentVersionsModel,
          as: 'versions',
          where: { IsCurrentVersion: true },
          required: false,
          limit: 1
        },
        {
          model: DocumentApprovalsModel,
          as: 'approvals',
          where: { Status: 'PENDING' },
          required: false
        },
        {
          model: DocumentCommentsModel,
          as: 'comments',
          where: { 
            Active: true,
            IsResolved: false 
          },
          required: false
        }
      ],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['CreatedDate', 'DESC']]
    });

    // Get system-wide statistics
    const stats = {
      totalDocuments: await DocumentsModel.count({ where: { Active: true } }),
      pendingApprovals: await DocumentApprovalsModel.count({ where: { Status: 'PENDING' } }),
      unresolvedComments: await DocumentCommentsModel.count({ where: { Active: true, IsResolved: false } }),
      recentActivities: await CollaboratorActivitiesModel.count({
        where: {
          ActivityDate: {
            [require('sequelize').Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000)
          }
        }
      })
    };

    res.status(200).json({
      success: true,
      data: {
        documents: documents.rows,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(documents.count / limit),
          totalItems: documents.count,
          itemsPerPage: parseInt(limit)
        },
        statistics: stats
      }
    });

  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching dashboard data',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});



module.exports = router;