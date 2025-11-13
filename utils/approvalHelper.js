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

    const whereClause = {
      DepartmentId: deptIdInt,
      subDepID: subDeptIdInt,
      Active: true
    };

    let matrix = await db.approvalmatrix.findOne({
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
        LinkID: linkId,
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
    let tracking = await db.DocumentApprovalTracking.findOne({
      where: { DocumentID: documentId, LinkID: linkId }
    });

    if (!tracking) {
      tracking = await db.DocumentApprovalTracking.create({
        DocumentID: documentId,
        LinkID: linkId,
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
    const approvals = await db.DocumentApprovals.findAll({
      where: {
        DocumentID: documentId,
        LinkID: linkId,
        IsCancelled: false
      },
      order: [['SequenceLevel', 'ASC'], ['ApprovalDate', 'ASC']]
    });

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
    const tracking = await db.DocumentApprovalTracking.findOne({
      where: { DocumentID: documentId, LinkID: linkId }
    });

    if (!tracking) {
      return null;
    }

    const levelDecisions = await getAllLevelDecisions(documentId, linkId);
    const allApprovals = await db.DocumentApprovals.findAll({
      where: {
        DocumentID: documentId,
        LinkID: linkId
      },
      order: [['SequenceLevel', 'ASC'], ['RequestedDate', 'ASC']]
    });

    // Get approvers for each level
    const levelDetails = {};
    for (let level = 1; level <= tracking.TotalLevels; level++) {
      const levelApprovals = allApprovals.filter(a => a.SequenceLevel === level);
      levelDetails[level] = {
        level: level,
        decision: levelDecisions[level] || 'PENDING',
        approvers: levelApprovals.map(a => ({
          approverId: a.ApproverID,
          approverName: a.ApproverName,
          status: a.Status,
          isCancelled: a.IsCancelled,
          approvalDate: a.ApprovalDate
        }))
      };
    }

    return {
      tracking: tracking,
      levelDetails: levelDetails,
      currentLevel: tracking.CurrentLevel,
      totalLevels: tracking.TotalLevels,
      finalStatus: tracking.FinalStatus,
      allorMajority: tracking.AllorMajority
    };
  } catch (error) {
    console.error('Error getting approval status:', error);
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


