// utils/checkPermission.js
// Helper function to check user permissions for document operations

const db = require('../config/database');
const AssignSubDepartment = db.AssignSubDepartment;
const DocumentAccess = db.DocumentAccess;

/**
 * Check if a user has a specific permission for a department and subdepartment
 * @param {number} userId - User ID
 * @param {number} departmentId - Department ID
 * @param {number} subDepartmentId - SubDepartment ID
 * @param {string} permissionType - Permission type: 'View', 'Add', 'Edit', 'Delete', 'Print', 'Confidential', 'Comment', 'Collaborate', 'Finalize', 'Masking'
 * @returns {Promise<boolean>} - Returns true if user has permission, false otherwise
 */
async function checkUserPermission(userId, departmentId, subDepartmentId, permissionType) {
    try {
        console.log(`[checkUserPermission] Checking permission for:`, {
            userId,
            departmentId,
            subDepartmentId,
            permissionType,
            userIdType: typeof userId,
            deptIdType: typeof departmentId,
            subDeptIdType: typeof subDepartmentId
        });
        
        // Convert to integers to ensure type consistency
        const userIdInt = parseInt(userId);
        const deptIdInt = parseInt(departmentId);
        const subDeptIdInt = parseInt(subDepartmentId);
        
        // Find the assigned subdepartment to get the LinkID
        // Try with integer types first
        let assignedSubDep = await AssignSubDepartment.findOne({
            where: { 
                DepartmentID: deptIdInt, 
                SubDepartmentID: subDeptIdInt, 
                UserID: userIdInt,
                Active: true 
            }
        });
        
        // If not found, try without UserID filter (in case LinkID is shared)
        if (!assignedSubDep) {
            console.log(`[checkUserPermission] No record found with UserID filter, trying without UserID...`);
            assignedSubDep = await AssignSubDepartment.findOne({
                where: { 
                    DepartmentID: deptIdInt, 
                    SubDepartmentID: subDeptIdInt, 
                    Active: true 
                }
            });
            
            if (assignedSubDep) {
                console.log(`[checkUserPermission] Found shared LinkID: ${assignedSubDep.LinkID}, but UserID ${userIdInt} not in this record`);
                // Check if there's a DocumentAccess record for this user with this LinkID
                // If yes, user has access via shared LinkID
            }
        }
        
        if (!assignedSubDep) {
            console.log(`[checkUserPermission] Permission Check Failed: User ${userIdInt} is not assigned to Department ${deptIdInt}, SubDepartment ${subDeptIdInt}`);
            // Try to find any record for this dept/subdept to see if it exists
            const anyRecord = await AssignSubDepartment.findOne({
                where: { 
                    DepartmentID: deptIdInt, 
                    SubDepartmentID: subDeptIdInt, 
                    Active: true 
                },
                limit: 1
            });
            if (anyRecord) {
                console.log(`[checkUserPermission] Found other users assigned to this dept/subdept with LinkID: ${anyRecord.LinkID}`);
            } else {
                console.log(`[checkUserPermission] No records found for Department ${deptIdInt}, SubDepartment ${subDeptIdInt} at all`);
            }
            return false;
        }
        
        const linkID = assignedSubDep.LinkID;
        const linkIDStr = String(linkID);
        const linkIDNum = parseInt(linkID) || linkIDStr;
        
        console.log(`[checkUserPermission] Found AssignSubDepartment record with LinkID: ${linkID} (type: ${typeof linkID})`);
        
        // Fetch user permissions for this LinkID and UserID
        // Try both string and number LinkID
        let userPermissions = await DocumentAccess.findOne({
            where: { 
                LinkID: linkIDStr, 
                UserID: userIdInt,
                Active: true 
            }
        });
        
        if (!userPermissions) {
            console.log(`[checkUserPermission] Trying numeric LinkID: ${linkIDNum}`);
            userPermissions = await DocumentAccess.findOne({
                where: { 
                    LinkID: linkIDNum, 
                    UserID: userIdInt,
                    Active: true 
                }
            });
        }
        
        if (!userPermissions) {
            console.log(`[checkUserPermission] Permission Check Failed: No DocumentAccess record found for User ${userIdInt}, LinkID ${linkID} (tried both string and number)`);
            // Check if DocumentAccess exists for this LinkID at all
            const anyAccess = await DocumentAccess.findOne({
                where: { 
                    LinkID: linkIDStr,
                    Active: true 
                },
                limit: 1
            });
            if (anyAccess) {
                console.log(`[checkUserPermission] Found DocumentAccess records for LinkID ${linkID}, but not for User ${userIdInt}`);
            } else {
                const anyAccessNum = await DocumentAccess.findOne({
                    where: { 
                        LinkID: linkIDNum,
                        Active: true 
                    },
                    limit: 1
                });
                if (anyAccessNum) {
                    console.log(`[checkUserPermission] Found DocumentAccess records for LinkID ${linkIDNum} (numeric), but not for User ${userIdInt}`);
                } else {
                    console.log(`[checkUserPermission] No DocumentAccess records found for LinkID ${linkID} at all`);
                }
            }
            return false;
        }
        
        console.log(`[checkUserPermission] Found DocumentAccess record for User ${userIdInt}`);
        
        // Check the specific permission
        const permissionValue = userPermissions[permissionType];
        const hasPermission = permissionValue === true || permissionValue === 1;
        
        console.log(`[checkUserPermission] Permission '${permissionType}' value: ${permissionValue} (type: ${typeof permissionValue}), hasPermission: ${hasPermission}`);
        
        if (!hasPermission) {
            console.log(`[checkUserPermission] Permission Check Failed: User ${userIdInt} does not have '${permissionType}' permission. Value: ${permissionValue}`);
            // Log all permissions for debugging
            console.log(`[checkUserPermission] All permissions for this user:`, {
                View: userPermissions.View,
                Add: userPermissions.Add,
                Edit: userPermissions.Edit,
                Delete: userPermissions.Delete,
                Print: userPermissions.Print,
                Confidential: userPermissions.Confidential,
                Comment: userPermissions.Comment,
                Collaborate: userPermissions.Collaborate,
                Finalize: userPermissions.Finalize,
                Masking: userPermissions.Masking
            });
        }
        
        return hasPermission;
        
    } catch (error) {
        console.error('[checkUserPermission] Error checking user permission:', error);
        console.error('[checkUserPermission] Error name:', error.name);
        console.error('[checkUserPermission] Error message:', error.message);
        console.error('[checkUserPermission] Error stack:', error.stack);
        console.error('[checkUserPermission] Permission check params:', { userId, departmentId, subDepartmentId, permissionType });
        return false;
    }
}

/**
 * Get all permissions for a user for a specific department and subdepartment
 * @param {number} userId - User ID
 * @param {number} departmentId - Department ID
 * @param {number} subDepartmentId - SubDepartment ID
 * @returns {Promise<Object|null>} - Returns permissions object or null if not found
 */
async function getUserPermissions(userId, departmentId, subDepartmentId) {
    try {
        // Find the assigned subdepartment to get the LinkID
        const assignedSubDep = await AssignSubDepartment.findOne({
            where: { 
                DepartmentID: departmentId, 
                SubDepartmentID: subDepartmentId, 
                UserID: userId,
                Active: true 
            }
        });
        
        if (!assignedSubDep) {
            return null;
        }
        
        const linkID = assignedSubDep.LinkID;
        
        // Fetch user permissions for this LinkID and UserID
        const userPermissions = await DocumentAccess.findOne({
            where: { 
                LinkID: linkID, 
                UserID: userId,
                Active: true 
            }
        });
        
        if (!userPermissions) {
            return null;
        }
        
        // Return formatted permissions
        return {
            View: userPermissions.View || false,
            Add: userPermissions.Add || false,
            Edit: userPermissions.Edit || false,
            Delete: userPermissions.Delete || false,
            Print: userPermissions.Print || false,
            Confidential: userPermissions.Confidential || false,
            Comment: userPermissions.Comment || false,
            Collaborate: userPermissions.Collaborate || false,
            Finalize: userPermissions.Finalize || false,
            Masking: userPermissions.Masking || false
        };
        
    } catch (error) {
        console.error('Error getting user permissions:', error);
        return null;
    }
}

/**
 * Get LinkID from department and subdepartment
 * @param {number} departmentId - Department ID
 * @param {number} subDepartmentId - SubDepartment ID
 * @param {number} userId - User ID (optional)
 * @returns {Promise<number|null>} - Returns LinkID or null if not found
 */
async function getLinkID(departmentId, subDepartmentId, userId = null) {
    try {
        const where = {
            DepartmentID: departmentId,
            SubDepartmentID: subDepartmentId,
            Active: true
        };
        
        if (userId) {
            where.UserID = userId;
        }
        
        const assignedSubDep = await AssignSubDepartment.findOne({ where });
        
        return assignedSubDep ? assignedSubDep.LinkID : null;
    } catch (error) {
        console.error('Error getting LinkID:', error);
        return null;
    }
}

/**
 * Diagnostic function to check what's missing for a user's permission
 * @param {number} userId - User ID
 * @param {number} departmentId - Department ID
 * @param {number} subDepartmentId - SubDepartment ID
 * @returns {Promise<Object>} - Returns diagnostic information
 */
async function diagnosePermissionIssue(userId, departmentId, subDepartmentId) {
    const diagnostics = {
        userId: parseInt(userId),
        departmentId: parseInt(departmentId),
        subDepartmentId: parseInt(subDepartmentId),
        hasAssignSubDepartment: false,
        assignSubDepartmentRecord: null,
        linkID: null,
        hasDocumentAccess: false,
        documentAccessRecord: null,
        allAssignSubDepartmentRecords: [],
        allDocumentAccessRecords: []
    };
    
    try {
        // Check AssignSubDepartment records
        const assignSubDep = await AssignSubDepartment.findOne({
            where: { 
                DepartmentID: parseInt(departmentId), 
                SubDepartmentID: parseInt(subDepartmentId), 
                UserID: parseInt(userId),
                Active: true 
            }
        });
        
        if (assignSubDep) {
            diagnostics.hasAssignSubDepartment = true;
            diagnostics.assignSubDepartmentRecord = assignSubDep.toJSON();
            diagnostics.linkID = assignSubDep.LinkID;
        }
        
        // Get all records for this dept/subdept (to see if LinkID exists)
        const allAssignSubDep = await AssignSubDepartment.findAll({
            where: { 
                DepartmentID: parseInt(departmentId), 
                SubDepartmentID: parseInt(subDepartmentId), 
                Active: true 
            },
            limit: 10
        });
        diagnostics.allAssignSubDepartmentRecords = allAssignSubDep.map(r => ({
            LinkID: r.LinkID,
            UserID: r.UserID,
            Active: r.Active
        }));
        
        // If we have a LinkID, check DocumentAccess
        if (diagnostics.linkID) {
            const linkIDStr = String(diagnostics.linkID);
            const linkIDNum = parseInt(diagnostics.linkID) || linkIDStr;
            
            let docAccess = await DocumentAccess.findOne({
                where: { 
                    LinkID: linkIDStr, 
                    UserID: parseInt(userId),
                    Active: true 
                }
            });
            
            if (!docAccess) {
                docAccess = await DocumentAccess.findOne({
                    where: { 
                        LinkID: linkIDNum, 
                        UserID: parseInt(userId),
                        Active: true 
                    }
                });
            }
            
            if (docAccess) {
                diagnostics.hasDocumentAccess = true;
                diagnostics.documentAccessRecord = docAccess.toJSON();
            }
            
            // Get all DocumentAccess records for this LinkID
            const allDocAccess = await DocumentAccess.findAll({
                where: { 
                    LinkID: linkIDStr,
                    Active: true 
                },
                limit: 10
            });
            diagnostics.allDocumentAccessRecords = allDocAccess.map(r => ({
                LinkID: r.LinkID,
                UserID: r.UserID,
                View: r.View,
                Active: r.Active
            }));
        }
        
    } catch (error) {
        diagnostics.error = error.message;
    }
    
    return diagnostics;
}

module.exports = {
    checkUserPermission,
    getUserPermissions,
    getLinkID,
    diagnosePermissionIssue
};

