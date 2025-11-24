const db = require('../config/database');
const { Op } = require('sequelize');

/**
 * Get Approval Matrix configuration for Department/SubDepartment
 */
async function getApprovalMatrix(departmentId, subDepartmentId) {
  try {
    const deptIdInt = departmentId !== undefined && departmentId !== null
      ? parseInt(departmentId, 10)
      : null;
    const subDeptIdInt = subDepartmentId !== undefined && subDepartmentId !== null
      ? parseInt(subDepartmentId, 10)
      : null;

    let matrix = null;
    
    // Try querying with DepartmentId first (if column exists)
    try {
      matrix = await db.approvalmatrix.findOne({
        where: {
          DepartmentId: deptIdInt,
          subDepID: subDeptIdInt,
          Active: true
        }
      });

      // Fallback: if no department-specific matrix, allow DepartmentId 0 (global)
      if (!matrix && deptIdInt !== null) {
        matrix = await db.approvalmatrix.findOne({
          where: {
            DepartmentId: 0,
            subDepID: subDeptIdInt,
            Active: true
          }
        });
      }
    } catch (deptError) {
      // If DepartmentId column doesn't exist, try querying without it
      if (deptError.message && (deptError.message.includes('Unknown column') || deptError.message.includes('Invalid column'))) {
        console.warn('DepartmentId column not found, querying without it');
        matrix = await db.approvalmatrix.findOne({
          where: {
            subDepID: subDeptIdInt,
            Active: true
          }
        });
      } else {
        throw deptError;
      }
    }

    return matrix;
  } catch (error) {
    console.error('Error getting approval matrix:', error);
    throw error;
  }
}

/**
 * Get approvers for a specific level
 */
async function getApproversByLevel(departmentId, subDepartmentId, level) {
  try {
    const approvers = await db.DocumentApprovers.findAll({
      where: {
        DepartmentId: departmentId,
        SubDepartmentId: subDepartmentId,
        SequenceLevel: level,
        Active: true
      }
    });
    return approvers;
  } catch (error) {
    console.error('Error getting approvers by level:', error);
    throw error;
  }
}

/**
 * Calculate total number of levels for Department/SubDepartment
 */
async function calculateTotalLevels(departmentId, subDepartmentId) {
  try {
    const approvers = await db.DocumentApprovers.findAll({
      where: {
        DepartmentId: departmentId,
        SubDepartmentId: subDepartmentId,
        Active: true
      },
      attributes: ['SequenceLevel'],
      raw: true
    });

    if (approvers.length === 0) {
      return 0;
    }

    const levels = approvers.map(a => a.SequenceLevel);
    const maxLevel = Math.max(...levels);
    return maxLevel;
  } catch (error) {
    console.error('Error calculating total levels:', error);
    throw error;
  }
}

/**
 * Get all approvers for Department/SubDepartment grouped by level
 */
async function getAllApproversByDeptSubDept(departmentId, subDepartmentId) {
  try {
    const approvers = await db.DocumentApprovers.findAll({
      where: {
        DepartmentId: departmentId,
        SubDepartmentId: subDepartmentId,
        Active: true
      },
      order: [['SequenceLevel', 'ASC']]
    });
    return approvers;
  } catch (error) {
    console.error('Error getting all approvers:', error);
    throw error;
  }
}

/**
 * Create approval requests for a specific level
 */
async function createApprovalRequestsForLevel(documentId, linkId, level, requestedBy) {
  try {
    const document = await db.Documents.findByPk(documentId);
    if (!document) {
      throw new Error('Document not found');
    }

    // Ensure LinkID is a string
    const linkIdStr = String(linkId || document.LinkID || documentId);

    const approvers = await getApproversByLevel(document.DepartmentId, document.SubDepartmentId, level);
    
    if (approvers.length === 0) {
      throw new Error(`No approvers found for Level ${level}`);
    }

    const requests = [];
    for (const approver of approvers) {
      // Get user details
      const user = await db.Users.findOne({
        where: { ID: approver.ApproverID }
      });

      const approvalRequest = await db.DocumentApprovals.create({
        DocumentID: documentId,
        LinkID: linkIdStr,
        RequestedBy: requestedBy,
        RequestedDate: new Date(),
        ApproverID: approver.ApproverID,
        ApproverName: user ? user.UserName : `User ${approver.ApproverID}`,
        SequenceLevel: level,
        Status: 'PENDING',
        IsCancelled: false
      });

      requests.push(approvalRequest);
    }

    return requests;
  } catch (error) {
    console.error('Error creating approval requests:', error);
    throw error;
  }
}

/**
 * Cancel remaining approval requests in the same level
 */
async function cancelRemainingRequests(documentId, linkId, level, approvedRequestId) {
  try {
    const cancelled = await db.DocumentApprovals.update(
      {
        IsCancelled: true,
        Status: 'CANCELLED'
      },
      {
        where: {
          DocumentID: documentId,
          LinkID: linkId,
          SequenceLevel: level,
          ID: { [Op.ne]: approvedRequestId },
          Status: 'PENDING'
        }
      }
    );

    return cancelled;
  } catch (error) {
    console.error('Error cancelling remaining requests:', error);
    throw error;
  }
}

/**
 * Get or create DocumentApprovalTracking record
 */
async function getOrCreateTracking(documentId, linkId, departmentId, subDepartmentId, totalLevels, allorMajority) {
  try {
    // Ensure LinkID is a string
    const linkIdStr = String(linkId || documentId);
    
    let tracking = await db.DocumentApprovalTracking.findOne({
      where: { DocumentID: documentId, LinkID: linkIdStr }
    });

    if (!tracking) {
      tracking = await db.DocumentApprovalTracking.create({
        DocumentID: documentId,
        LinkID: linkIdStr,
        DepartmentId: departmentId,
        SubDepartmentId: subDepartmentId,
        CurrentLevel: 1,
        TotalLevels: totalLevels,
        AllorMajority: allorMajority || 'MAJORITY',
        FinalStatus: 'IN_PROGRESS',
        LevelsCompleted: 0
      });
    }

    return tracking;
  } catch (error) {
    console.error('Error getting/creating tracking:', error);
    throw error;
  }
}

/**
 * Update tracking record
 */
async function updateTracking(documentId, updates) {
  try {
    const tracking = await db.DocumentApprovalTracking.findOne({
      where: { DocumentID: documentId }
    });

    if (!tracking) {
      throw new Error('Tracking record not found');
    }

    updates.UpdatedDate = new Date();
    await tracking.update(updates);

    return tracking;
  } catch (error) {
    console.error('Error updating tracking:', error);
    throw error;
  }
}

/**
 * Move to next level
 */
async function moveToNextLevel(documentId, linkId, currentLevel, requestedBy) {
  try {
    const nextLevel = currentLevel + 1;
    const document = await db.Documents.findByPk(documentId);
    
    if (!document) {
      throw new Error('Document not found');
    }

    // Check if there are approvers for next level
    const approvers = await getApproversByLevel(document.DepartmentId, document.SubDepartmentId, nextLevel);
    
    if (approvers.length === 0) {
      // No more levels, all levels completed
      return { hasNextLevel: false, level: nextLevel };
    }

    // Create requests for next level
    await createApprovalRequestsForLevel(documentId, linkId, nextLevel, requestedBy);

    // Update tracking
    await updateTracking(documentId, {
      CurrentLevel: nextLevel,
      LevelsCompleted: currentLevel
    });

    return { hasNextLevel: true, level: nextLevel };
  } catch (error) {
    console.error('Error moving to next level:', error);
    throw error;
  }
}

/**
 * Check if all levels are completed
 */
async function checkAllLevelsCompleted(documentId) {
  try {
    const tracking = await db.DocumentApprovalTracking.findOne({
      where: { DocumentID: documentId }
    });

    if (!tracking) {
      return false;
    }

    // Get all level decisions to verify all levels have been decided
    const document = await db.Documents.findByPk(documentId);
    if (!document) {
      return false;
    }

    const levelDecisions = await getAllLevelDecisions(documentId, document.LinkID);
    const decidedLevels = Object.keys(levelDecisions).length;
    
    return decidedLevels >= tracking.TotalLevels;
  } catch (error) {
    console.error('Error checking levels completed:', error);
    throw error;
  }
}

/**
 * Get all level decisions for a document
 */
async function getAllLevelDecisions(documentId, linkId) {
  try {
    // ⚡ FIX: Handle LinkID type (string or number)
    const linkIdStr = String(linkId);
    const linkIdNum = parseInt(linkId) || linkIdStr;
    
    // ⚡ FIX: Try string first, fallback to number
    let approvals;
    try {
      approvals = await db.DocumentApprovals.findAll({
        where: {
          DocumentID: documentId,
          LinkID: linkIdStr,
          IsCancelled: false
        },
        order: [['SequenceLevel', 'ASC'], ['ApprovalDate', 'ASC']]
      });
    } catch {
      approvals = await db.DocumentApprovals.findAll({
        where: {
          DocumentID: documentId,
          LinkID: linkIdNum,
          IsCancelled: false
        },
        order: [['SequenceLevel', 'ASC'], ['ApprovalDate', 'ASC']]
      });
    }

    // Group by level and get the decision (first non-cancelled, non-pending decision per level)
    const levelDecisions = {};
    approvals.forEach(approval => {
      if (!levelDecisions[approval.SequenceLevel] && approval.Status !== 'PENDING') {
        levelDecisions[approval.SequenceLevel] = approval.Status.toUpperCase();
      }
    });

    return levelDecisions;
  } catch (error) {
    console.error('Error getting level decisions:', error);
    throw error;
  }
}

/**
 * Calculate final status based on "ALL" or "MAJORITY" rule
 */
async function calculateFinalStatus(documentId, linkId) {
  try {
    const tracking = await db.DocumentApprovalTracking.findOne({
      where: { DocumentID: documentId }
    });

    if (!tracking) {
      throw new Error('Tracking record not found');
    }

    const levelDecisions = await getAllLevelDecisions(documentId, linkId);
    const decisions = Object.values(levelDecisions);

    let finalStatus = 'REJECTED';

    if (tracking.AllorMajority === 'ALL') {
      // ALL rule: All levels must be APPROVED
      const allApproved = decisions.every(decision => decision === 'APPROVED');
      finalStatus = allApproved ? 'APPROVED' : 'REJECTED';
    } else if (tracking.AllorMajority === 'MAJORITY') {
      // MAJORITY rule: Count approvals vs rejections
      const approvedCount = decisions.filter(d => d === 'APPROVED').length;
      const rejectedCount = decisions.filter(d => d === 'REJECTED').length;

      if (approvedCount > rejectedCount) {
        finalStatus = 'APPROVED';
      } else if (rejectedCount > approvedCount) {
        finalStatus = 'REJECTED';
      } else {
        // Tie - default to rejected
        finalStatus = 'REJECTED';
      }
    }

    // Update tracking with final status
    await updateTracking(documentId, {
      FinalStatus: finalStatus,
      LevelsCompleted: tracking.TotalLevels
    });

    return finalStatus;
  } catch (error) {
    console.error('Error calculating final status:', error);
    throw error;
  }
}

/**
 * Get approval status with level details
 */
async function getApprovalStatus(documentId, linkId) {
  try {
    console.log('getApprovalStatus called with:', { documentId, linkId, linkIdType: typeof linkId });
    
    // ⚡ FIX: Handle LinkID type (string or number)
    const linkIdStr = String(linkId);
    const linkIdNum = parseInt(linkId) || linkIdStr;
    
    // ⚡ FIX: Try string first, fallback to number
    let tracking;
    try {
      console.log('Fetching tracking with string LinkID:', linkIdStr);
      tracking = await db.DocumentApprovalTracking.findOne({
        where: { DocumentID: documentId, LinkID: linkIdStr }
      });
      console.log('Tracking found with string LinkID:', tracking ? 'Yes' : 'No');
    } catch (trackingError) {
      console.error('Error fetching tracking with string LinkID:', trackingError.message);
      try {
        console.log('Trying numeric LinkID:', linkIdNum);
        tracking = await db.DocumentApprovalTracking.findOne({
          where: { DocumentID: documentId, LinkID: linkIdNum }
        });
        console.log('Tracking found with numeric LinkID:', tracking ? 'Yes' : 'No');
      } catch (numError) {
        console.error('Error fetching tracking with numeric LinkID:', numError.message);
        throw trackingError; // Throw original error
      }
    }

    if (!tracking) {
      console.log('No tracking record found for document:', documentId);
      return null;
    }

    console.log('Tracking record found:', {
      DocumentID: tracking.DocumentID,
      LinkID: tracking.LinkID,
      TotalLevels: tracking.TotalLevels,
      CurrentLevel: tracking.CurrentLevel,
      FinalStatus: tracking.FinalStatus
    });

    // Get level decisions with error handling
    let levelDecisions = {};
    try {
      console.log('Getting level decisions with string LinkID');
      levelDecisions = await getAllLevelDecisions(documentId, linkIdStr);
      console.log('Level decisions retrieved:', Object.keys(levelDecisions).length, 'levels');
    } catch (levelDecisionsError) {
      console.error('Error in getAllLevelDecisions:', levelDecisionsError.message);
      // Try with numeric LinkID as fallback
      try {
        console.log('Trying level decisions with numeric LinkID');
        levelDecisions = await getAllLevelDecisions(documentId, linkIdNum);
        console.log('Level decisions retrieved (fallback):', Object.keys(levelDecisions).length, 'levels');
      } catch (fallbackError) {
        console.error('Error in getAllLevelDecisions fallback:', fallbackError.message);
        // Continue with empty levelDecisions object
        levelDecisions = {};
      }
    }
    
    // ⚡ FIX: Try string first, fallback to number for approvals
    let allApprovals = [];
    try {
      console.log('Fetching approvals with string LinkID');
      allApprovals = await db.DocumentApprovals.findAll({
        where: {
          DocumentID: documentId,
          LinkID: linkIdStr
        },
        order: [['SequenceLevel', 'ASC'], ['RequestedDate', 'ASC']]
      });
      console.log('Approvals found with string LinkID:', allApprovals.length);
    } catch (err) {
      console.error('Error fetching approvals with string LinkID:', err.message);
      try {
        console.log('Trying approvals with numeric LinkID');
        allApprovals = await db.DocumentApprovals.findAll({
          where: {
            DocumentID: documentId,
            LinkID: linkIdNum
          },
          order: [['SequenceLevel', 'ASC'], ['RequestedDate', 'ASC']]
        });
        console.log('Approvals found with numeric LinkID:', allApprovals.length);
      } catch (fallbackErr) {
        console.error('Error fetching approvals in getApprovalStatus fallback:', fallbackErr.message);
        allApprovals = []; // Default to empty array
      }
    }
    
    // Ensure allApprovals is an array
    if (!Array.isArray(allApprovals)) {
      console.warn('allApprovals is not an array, converting to empty array');
      allApprovals = [];
    }

    // Get approvers for each level
    const levelDetails = {};
    const totalLevels = tracking.TotalLevels || 0;
    
    console.log('Processing level details for', totalLevels, 'levels');
    
    // Only loop if TotalLevels is a valid number
    if (totalLevels > 0 && Number.isInteger(totalLevels)) {
      for (let level = 1; level <= totalLevels; level++) {
        const levelApprovals = allApprovals.filter(a => a && a.SequenceLevel === level);
        levelDetails[level] = {
          level: level,
          decision: levelDecisions[level] || 'PENDING',
          approvers: levelApprovals.map(a => ({
            approverId: a.ApproverID || null,
            approverName: a.ApproverName || null,
            status: a.Status || 'PENDING',
            isCancelled: a.IsCancelled || false,
            approvalDate: a.ApprovalDate || null
          }))
        };
      }
    } else {
      console.warn('Invalid totalLevels value:', totalLevels, 'Skipping level details processing');
    }

    const result = {
      tracking: tracking,
      levelDetails: levelDetails,
      currentLevel: tracking.CurrentLevel || 0,
      totalLevels: totalLevels,
      finalStatus: tracking.FinalStatus || 'PENDING',
      allorMajority: tracking.AllorMajority || 'MAJORITY'
    };
    
    console.log('Returning approval status result');
    return result;
  } catch (error) {
    console.error('Error getting approval status:', error);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    if (error.original) {
      console.error('Original error:', error.original);
    }
    throw error;
  }
}

module.exports = {
  getApprovalMatrix,
  getApproversByLevel,
  calculateTotalLevels,
  getAllApproversByDeptSubDept,
  createApprovalRequestsForLevel,
  cancelRemainingRequests,
  getOrCreateTracking,
  updateTracking,
  moveToNextLevel,
  checkAllLevelsCompleted,
  getAllLevelDecisions,
  calculateFinalStatus,
  getApprovalStatus
};


