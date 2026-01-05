const db = require('../config/database');
const { Op } = require('sequelize');

/**
 * Get Approval Matrix configuration for Department/SubDepartment
 * ⚡ OPTIMIZED: Uses OR condition and raw query for performance
 */
async function getApprovalMatrix(departmentId, subDepartmentId) {
  try {
    const deptIdInt = departmentId !== undefined && departmentId !== null
      ? parseInt(departmentId, 10)
      : null;
    const subDeptIdInt = subDepartmentId !== undefined && subDepartmentId !== null
      ? parseInt(subDepartmentId, 10)
      : null;

    // ⚡ OPTIMIZATION: Use OR condition to check both specific and global (0) department
    // ⚡ NOTE: Ensure index exists on (DepartmentId, subDepID, Active) for fast lookup
    const matrix = await db.approvalmatrix.findOne({
      where: {
        [Op.or]: [
          { DepartmentId: deptIdInt, subDepID: subDeptIdInt, Active: true },
          { DepartmentId: 0, subDepID: subDeptIdInt, Active: true }  // Global fallback
        ]
      },
      order: [['DepartmentId', 'DESC']],  // Prefer specific department over global
      raw: true  // ⚡ Faster query without model instantiation
    });

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
 * ⚡ OPTIMIZED: Uses batch user query and bulk insert for performance
 */
async function createApprovalRequestsForLevel(documentId, linkId, level, requestedBy, document = null) {
  const startTime = Date.now();

  try {
    // ⚡ OPTIMIZATION: Accept document parameter to avoid redundant fetch
    if (!document) {
      document = await db.Documents.findByPk(documentId, {
        attributes: {
          exclude: ['DataImage']  // ⚡ CRITICAL: Exclude BLOB field
        }
      });
      if (!document) {
        throw new Error('Document not found');
      }
    }

    // Ensure LinkID is a string
    const linkIdStr = String(linkId || document.LinkID || documentId);

    const approvers = await getApproversByLevel(document.DepartmentId, document.SubDepartmentId, level);

    if (approvers.length === 0) {
      throw new Error(`No approvers found for Level ${level}`);
    }

    // ⚡ OPTIMIZATION: Batch fetch all users at once (fixes N+1 query problem)
    const userQueryStart = Date.now();
    const approverIds = approvers.map(a => a.ApproverID);
    const users = await db.Users.findAll({
      where: { ID: { [Op.in]: approverIds } },
      attributes: ['ID', 'UserName'],
      raw: true
    });
    const userMap = Object.fromEntries(users.map(u => [u.ID, u.UserName]));
    console.log(`⚡[PERF] Batch user query(${approvers.length} users): ${Date.now() - userQueryStart} ms`);

    // ⚡ OPTIMIZATION: Prepare all approval data for bulk insert
    const currentDate = new Date();
    const approvalData = approvers.map(approver => ({
      DocumentID: documentId,
      LinkID: linkIdStr,
      RequestedBy: requestedBy,
      RequestedDate: currentDate,
      ApproverID: approver.ApproverID,
      ApproverName: userMap[approver.ApproverID] || `User ${approver.ApproverID} `,
      SequenceLevel: level,
      Status: 'PENDING',
      IsCancelled: false
    }));

    // ⚡ OPTIMIZATION: Single bulk insert instead of sequential creates
    const bulkInsertStart = Date.now();
    const requests = await db.DocumentApprovals.bulkCreate(approvalData);
    console.log(`⚡[PERF] Bulk insert(${approvalData.length} records): ${Date.now() - bulkInsertStart} ms`);

    console.log(`⚡[PERF] Total createApprovalRequestsForLevel: ${Date.now() - startTime} ms`);
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
    const document = await db.Documents.findByPk(documentId, {
      attributes: {
        exclude: ['DataImage']  // ⚡ CRITICAL: Exclude BLOB field
      }
    });

    if (!document) {
      throw new Error('Document not found');
    }

    // Check if there are approvers for next level
    const approvers = await getApproversByLevel(document.DepartmentId, document.SubDepartmentId, nextLevel);

    if (approvers.length === 0) {
      // No more levels, all levels completed
      return { hasNextLevel: false, level: nextLevel };
    }

    // Create requests for next level (pass document to avoid redundant fetch)
    await createApprovalRequestsForLevel(documentId, linkId, nextLevel, requestedBy, document);

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
    const document = await db.Documents.findByPk(documentId, {
      attributes: {
        exclude: ['DataImage']  // ⚡ CRITICAL: Exclude BLOB field
      }
    });
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
 * ⚡ OPTIMIZED: Uses OR condition for LinkID instead of try-catch fallback
 */
async function getAllLevelDecisions(documentId, linkId) {
  try {
    // ⚡ OPTIMIZATION: Handle LinkID type using OR condition
    const linkIdStr = String(linkId);
    const linkIdNum = isNaN(linkId) ? null : parseInt(linkId);

    // ⚡ OPTIMIZATION: Single query with OR condition
    const approvals = await db.DocumentApprovals.findAll({
      where: {
        DocumentID: documentId,
        [Op.or]: linkIdNum !== null && linkIdNum !== linkIdStr
          ? [{ LinkID: linkIdStr }, { LinkID: linkIdNum }]
          : [{ LinkID: linkIdStr }],
        IsCancelled: false
      },
      order: [['SequenceLevel', 'ASC'], ['ApprovalDate', 'ASC']],
      raw: true
    }).catch(() => []);

    // Group by level and get the decision (first non-cancelled, non-pending decision per level)
    const levelDecisions = {};
    if (Array.isArray(approvals)) {
      approvals.forEach(approval => {
        const level = approval.SequenceLevel;
        if (level && !levelDecisions[level] && approval.Status && approval.Status !== 'PENDING') {
          levelDecisions[level] = approval.Status.toUpperCase();
        }
      });
    }

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
 * ⚡ OPTIMIZED: Uses parallel queries and OR conditions for LinkID
 */
async function getApprovalStatus(documentId, linkId) {
  try {
    // ⚡ OPTIMIZATION: Handle LinkID type (string or number) using OR condition
    const linkIdStr = String(linkId);
    const linkIdNum = isNaN(linkId) ? null : parseInt(linkId);

    // ⚡ OPTIMIZATION: Fetch tracking and approvals in parallel using OR condition
    const [tracking, allApprovals] = await Promise.all([
      // Fetch tracking with OR condition for LinkID
      db.DocumentApprovalTracking.findOne({
        where: {
          DocumentID: documentId,
          [Op.or]: linkIdNum !== null && linkIdNum !== linkIdStr
            ? [{ LinkID: linkIdStr }, { LinkID: linkIdNum }]
            : [{ LinkID: linkIdStr }]
        },
        raw: false // Keep as model instance for easier access
      }).catch(() => null),

      // Fetch all approvals with OR condition for LinkID
      db.DocumentApprovals.findAll({
        where: {
          DocumentID: documentId,
          [Op.or]: linkIdNum !== null && linkIdNum !== linkIdStr
            ? [{ LinkID: linkIdStr }, { LinkID: linkIdNum }]
            : [{ LinkID: linkIdStr }],
          IsCancelled: false
        },
        order: [['SequenceLevel', 'ASC'], ['RequestedDate', 'ASC']],
        raw: true
      }).catch(() => [])
    ]);

    if (!tracking) {
      return null;
    }

    // ⚡ OPTIMIZATION: Calculate level decisions from approvals (no separate query needed)
    const levelDecisions = {};
    if (Array.isArray(allApprovals) && allApprovals.length > 0) {
      allApprovals.forEach(approval => {
        const level = approval.SequenceLevel;
        if (level && !levelDecisions[level] && approval.Status && approval.Status !== 'PENDING') {
          levelDecisions[level] = approval.Status.toUpperCase();
        }
      });
    }

    // ⚡ OPTIMIZATION: Build level details efficiently
    const levelDetails = {};
    const totalLevels = tracking.TotalLevels || 0;

    if (totalLevels > 0 && Number.isInteger(totalLevels)) {
      for (let level = 1; level <= totalLevels; level++) {
        const levelApprovals = Array.isArray(allApprovals)
          ? allApprovals.filter(a => a && a.SequenceLevel === level)
          : [];

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
    }

    return {
      tracking: tracking,
      levelDetails: levelDetails,
      currentLevel: tracking.CurrentLevel || 0,
      totalLevels: totalLevels,
      finalStatus: tracking.FinalStatus || 'PENDING',
      allorMajority: tracking.AllorMajority || 'MAJORITY'
    };
  } catch (error) {
    console.error('Error getting approval status:', error.message);
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


