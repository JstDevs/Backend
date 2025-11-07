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
            return false;
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
            return false;
        }
        
        // Check the specific permission
        const permissionValue = userPermissions[permissionType];
        return permissionValue === true || permissionValue === 1;
        
    } catch (error) {
        console.error('Error checking user permission:', error);
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

module.exports = {
    checkUserPermission,
    getUserPermissions,
    getLinkID
};

