// utils/checkPermission.js
// Helper function to check user permissions for document operations

const db = require('../config/database');
const AssignSubDepartment = db.AssignSubDepartment;
const DocumentAccess = db.DocumentAccess;
const RoleDocumentAccess = db.RoleDocumentAccess;
const UserUserAccess = db.UserUserAccess;

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
        
        // STEP 1: Check for user-specific override in DocumentAccess (takes precedence)
        let userPermissions = await DocumentAccess.findOne({
            where: { 
                LinkID: linkIDStr, 
                UserID: userIdInt,
                Active: true 
            }
        });
        
        if (!userPermissions) {
            userPermissions = await DocumentAccess.findOne({
                where: { 
                    LinkID: linkIDNum, 
                    UserID: userIdInt,
                    Active: true 
                }
            });
        }
        
        // If user has specific override, use it
        if (userPermissions) {
            console.log(`[checkUserPermission] Found user-specific DocumentAccess override for User ${userIdInt}`);
            const permissionValue = userPermissions[permissionType];
            const hasPermission = permissionValue === true || permissionValue === 1;
            console.log(`[checkUserPermission] Permission '${permissionType}' from user override: ${hasPermission}`);
            return hasPermission;
        }
        
        // STEP 2: Check role-based permissions
        // Get user's roles
        const userRoles = await UserUserAccess.findAll({
            where: { UserID: userIdInt }
        });
        
        if (!userRoles || userRoles.length === 0) {
            console.log(`[checkUserPermission] No roles found for User ${userIdInt}, checking userAccessArray...`);
            // Try to get from userAccessArray if available
            const user = await db.Users.findOne({ where: { ID: userIdInt } });
            if (user && user.userAccessArray && Array.isArray(user.userAccessArray) && user.userAccessArray.length > 0) {
                // Use userAccessArray to check roles
                const roleIds = user.userAccessArray;
                const rolePermissions = await RoleDocumentAccess.findAll({
                    where: { 
                        LinkID: linkIDStr,
                        UserAccessID: { [db.Sequelize.Op.in]: roleIds },
                        Active: true 
                    }
                });
                
                if (rolePermissions.length > 0) {
                    // Check if any role has the permission
                    const hasPermission = rolePermissions.some(rp => rp[permissionType] === true || rp[permissionType] === 1);
                    console.log(`[checkUserPermission] Permission '${permissionType}' from roles (userAccessArray): ${hasPermission}`);
                    return hasPermission;
                }
            }
            console.log(`[checkUserPermission] Permission Check Failed: No roles found for User ${userIdInt}`);
            return false;
        }
        
        const roleIds = userRoles.map(ur => ur.UserAccessID);
        console.log(`[checkUserPermission] Found ${roleIds.length} roles for User ${userIdInt}:`, roleIds);
        
        // Get role-based permissions for this LinkID
        let rolePermissions = await RoleDocumentAccess.findAll({
            where: { 
                LinkID: linkIDStr,
                UserAccessID: { [db.Sequelize.Op.in]: roleIds },
                Active: true 
            }
        });
        
        if (rolePermissions.length === 0) {
            // Try numeric LinkID
            rolePermissions = await RoleDocumentAccess.findAll({
                where: { 
                    LinkID: linkIDNum,
                    UserAccessID: { [db.Sequelize.Op.in]: roleIds },
                    Active: true 
                }
            });
        }
        
        if (rolePermissions.length === 0) {
            console.log(`[checkUserPermission] Permission Check Failed: No RoleDocumentAccess found for User ${userIdInt} roles, LinkID ${linkID}`);
            return false;
        }
        
        console.log(`[checkUserPermission] Found ${rolePermissions.length} role-based permissions for User ${userIdInt}`);
        
        // Check if any role has the permission (OR logic - if any role grants it, user has it)
        const hasPermission = rolePermissions.some(rp => rp[permissionType] === true || rp[permissionType] === 1);
        
        console.log(`[checkUserPermission] Permission '${permissionType}' from roles: ${hasPermission}`);
        
        if (!hasPermission) {
            console.log(`[checkUserPermission] Permission Check Failed: User ${userIdInt} does not have '${permissionType}' permission from any role.`);
            // Log role permissions for debugging
            const rolePermsSummary = rolePermissions.map(rp => ({
                UserAccessID: rp.UserAccessID,
                [permissionType]: rp[permissionType]
            }));
            console.log(`[checkUserPermission] Role permissions checked:`, rolePermsSummary);
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
                Active: true 
            }
        });
        
        if (!assignedSubDep) {
            return null;
        }
        
        const linkID = assignedSubDep.LinkID;
        const linkIDStr = String(linkID);
        const linkIDNum = parseInt(linkID) || linkIDStr;
        
        // STEP 1: Check for user-specific override (takes precedence)
        let userPermissions = await DocumentAccess.findOne({
            where: { 
                LinkID: linkIDStr, 
                UserID: userId,
                Active: true 
            }
        });
        
        if (!userPermissions) {
            userPermissions = await DocumentAccess.findOne({
                where: { 
                    LinkID: linkIDNum, 
                    UserID: userId,
                    Active: true 
                }
            });
        }
        
        // If user has specific override, return it
        if (userPermissions) {
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
                Masking: userPermissions.Masking || false,
                source: 'user-override'
            };
        }
        
        // STEP 2: Get role-based permissions
        const userRoles = await UserUserAccess.findAll({
            where: { UserID: userId }
        });
        
        if (!userRoles || userRoles.length === 0) {
            // Try userAccessArray
            const user = await db.Users.findOne({ where: { ID: userId } });
            if (user && user.userAccessArray && Array.isArray(user.userAccessArray) && user.userAccessArray.length > 0) {
                const roleIds = user.userAccessArray;
                const rolePermissions = await RoleDocumentAccess.findAll({
                    where: { 
                        LinkID: linkIDStr,
                        UserAccessID: { [db.Sequelize.Op.in]: roleIds },
                        Active: true 
                    }
                });
                
                if (rolePermissions.length > 0) {
                    // Merge permissions from all roles (OR logic - if any role grants it, user has it)
                    const merged = {
                        View: rolePermissions.some(rp => rp.View === true || rp.View === 1),
                        Add: rolePermissions.some(rp => rp.Add === true || rp.Add === 1),
                        Edit: rolePermissions.some(rp => rp.Edit === true || rp.Edit === 1),
                        Delete: rolePermissions.some(rp => rp.Delete === true || rp.Delete === 1),
                        Print: rolePermissions.some(rp => rp.Print === true || rp.Print === 1),
                        Confidential: rolePermissions.some(rp => rp.Confidential === true || rp.Confidential === 1),
                        Comment: rolePermissions.some(rp => rp.Comment === true || rp.Comment === 1),
                        Collaborate: rolePermissions.some(rp => rp.Collaborate === true || rp.Collaborate === 1),
                        Finalize: rolePermissions.some(rp => rp.Finalize === true || rp.Finalize === 1),
                        Masking: rolePermissions.some(rp => rp.Masking === true || rp.Masking === 1),
                        source: 'role-based'
                    };
                    return merged;
                }
            }
            return null;
        }
        
        const roleIds = userRoles.map(ur => ur.UserAccessID);
        
        let rolePermissions = await RoleDocumentAccess.findAll({
            where: { 
                LinkID: linkIDStr,
                UserAccessID: { [db.Sequelize.Op.in]: roleIds },
                Active: true 
            }
        });
        
        if (rolePermissions.length === 0) {
            rolePermissions = await RoleDocumentAccess.findAll({
                where: { 
                    LinkID: linkIDNum,
                    UserAccessID: { [db.Sequelize.Op.in]: roleIds },
                    Active: true 
                }
            });
        }
        
        if (rolePermissions.length === 0) {
            return null;
        }
        
        // Merge permissions from all roles (OR logic)
        return {
            View: rolePermissions.some(rp => rp.View === true || rp.View === 1),
            Add: rolePermissions.some(rp => rp.Add === true || rp.Add === 1),
            Edit: rolePermissions.some(rp => rp.Edit === true || rp.Edit === 1),
            Delete: rolePermissions.some(rp => rp.Delete === true || rp.Delete === 1),
            Print: rolePermissions.some(rp => rp.Print === true || rp.Print === 1),
            Confidential: rolePermissions.some(rp => rp.Confidential === true || rp.Confidential === 1),
            Comment: rolePermissions.some(rp => rp.Comment === true || rp.Comment === 1),
            Collaborate: rolePermissions.some(rp => rp.Collaborate === true || rp.Collaborate === 1),
            Finalize: rolePermissions.some(rp => rp.Finalize === true || rp.Finalize === 1),
            Masking: rolePermissions.some(rp => rp.Masking === true || rp.Masking === 1),
            source: 'role-based'
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

