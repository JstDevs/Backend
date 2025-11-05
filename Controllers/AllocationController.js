const express = require('express');
const { Op } = require('sequelize');
const router = express.Router();

// Import Sequelize models
const requireAuth = require('../middleware/requireAuth'); // Adjust the path as needed

const db = require('../config/database'); // Adjust the path as needed
// Import models (assuming they're already defined)
const Department=db.Department;
const SubDepartment=db.SubDepartment;
const AssignSubdepartment=db.AssignSubDepartment;

const Fields=db.Fields;
const Users=db.Users;
const DocumentAccess=db.DocumentAccess;
// Helper function to get session username
const getSessionUsername = (req) => {
    return req.user.userName || null;
};

// Helper function to generate LinkID
const generateLinkID = () => {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const year = now.getFullYear();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const milliseconds = String(now.getMilliseconds()).padStart(4, '0');
    
    return `${month}${day}${year}${hours}${minutes}${seconds}${milliseconds}`;
};

// Helper function to load document type data
const loadDocumentType = async (depid, subdepid, req) => {
    const assignSubDep = await AssignSubdepartment.findAll({
        where: { DepartmentID: depid, Active: true }
    });
    
    const dept = await Department.findOne({ where: { ID: depid } });
    const subDeptList = await SubDepartment.findAll({ where: { Active: true } });
    
    req.viewData = req.viewData || {};
    req.viewBag = req.viewBag || {};
    
    req.viewData.AssignSubDep = assignSubDep;
    req.viewBag.Department = dept.Name;
    req.viewBag.depid = depid;

    if (assignSubDep.length > 0) {
            const subdept = await SubDepartment.findAll({ where: { Active: true } });
        
        // Remove assigned subdepartments from available list
        const filteredSubDeptList = subDeptList.filter(subDept => 
            !assignSubDep.some(assigned => assigned.SubDepartmentID === subDept.ID)
        );

        req.viewBag.remainingSub = filteredSubDeptList.length > 0;

        if (subdepid !== 0) {
            const selectedSub = subdept.find(sub => sub.ID === subdepid);
            if (selectedSub) {
                req.viewBag.SubDepartment = selectedSub.Name;
                req.viewBag.subdepid = subdepid;
            }
            
            const item = await AssignSubdepartment.findOne({
                where: { 
                    DepartmentID: depid, 
                    SubDepartmentID: subdepid, 
                    Active: true 
                }
            });
            
            if (item) {
                await loadDocumentAccess(item.LinkID, req);
            }
        } else {
            const firstAssigned = assignSubDep[0];
            const selectedSub = subdept.find(sub => sub.ID === firstAssigned.SubDepartmentID);
            if (selectedSub) {
                req.viewBag.SubDepartment = selectedSub.Name;
                req.viewBag.subdepid = firstAssigned.SubDepartmentID;
            }
            await loadDocumentAccess(firstAssigned.LinkID, req);
        }
    } else {
        req.viewBag.remainingSub = true;
    }
};

// Helper function to load document access data
const loadDocumentAccess = async (linkID, req) => {
    req.viewBag = req.viewBag || {};
    req.viewData = req.viewData || {};
    
    req.viewBag.linkid = linkID;
    
    const users = await Users.findAll();
    const selectedDocumentAccess = await DocumentAccess.findAll({
        where: { LinkID: linkID, Active: true }
    });
    
    const activeUsers = await Users.findAll({ where: { Active: true } });
    const docuAccess = await DocumentAccess.findAll({
        where: { LinkID: linkID, Active: true }
    });

    // Filter out users who already have access
    const availableUsers = activeUsers.filter(user => 
        !docuAccess.some(access => access.UserID === user.ID)
    );

    req.viewData.Users = users;
    req.viewData.selectedDocumentAccess = selectedDocumentAccess;
    req.viewBag.availableUsers = availableUsers.length > 0;
};

// Routes
router.get('/', async (req, res) => {
    try {
        const { depid = 0, linkid = 0, subdepid = 0, departmentId, subDepartmentId } = req.query;
        
        // Handle JSON API requests for departmentId/subDepartmentId (frontend API calls)
        if (departmentId && subDepartmentId) {
            // Find ALL assigned subdepartment records (may have multiple UserIDs with different LinkIDs)
            const assignedSubDeps = await AssignSubdepartment.findAll({
                where: { 
                    DepartmentID: departmentId, 
                    SubDepartmentID: subDepartmentId, 
                    Active: true 
                }
            });
            
            if (!assignedSubDeps || assignedSubDeps.length === 0) {
                return res.json({ status: true, data: [] }); // Return empty array if no assignment found
            }
            
            // Get all unique LinkIDs from the assigned subdepartments
            const linkIDs = [...new Set(assignedSubDeps.map(item => item.LinkID))];
            
            const allocations = await DocumentAccess.findAll({
                where: { 
                    LinkID: { [Op.in]: linkIDs },
                    Active: true 
                },
                include: [{
                    model: Users,
                    attributes: ['ID', 'UserName', 'Active']
                }],
                order: [['CreatedDate', 'DESC']]
            });
            
            return res.json({ status: true, data: allocations });
        }
        
        req.viewData = {};
        req.viewBag = {};

        // Check for TempData (stored in session)
        const finalListJson = req.session.FinalList;
        
        if (finalListJson) {
            const finalList = JSON.parse(finalListJson);
            req.viewData.DepartmentList = finalList;
            
            const firstList = finalList[0];
            if (firstList) {
                await loadDocumentType(firstList.ID, 0, req);
            }
            
            delete req.session.FinalList;
            return res.render('allocation/index', { viewData: req.viewData, viewBag: req.viewBag });
        }

        req.viewData.DepartmentList = await Department.findAll();
    req.viewData.SubdepartmentList = await SubDepartment.findAll({ where: { Active: true } });

        const sessionDepId = req.session.depid;
        if (sessionDepId) {
            await loadDocumentType(sessionDepId, subdepid, req);
            delete req.session.depid;
            return res.render('allocation/index', { viewData: req.viewData, viewBag: req.viewBag });
        }

        if (subdepid !== 0 && linkid !== 0) {
            await loadDocumentType(depid, subdepid, req);
            await loadDocumentAccess(linkid, req);
        }

        if (depid !== 0) {
            await loadDocumentType(depid, subdepid, req);
            return res.render('allocation/index', { viewData: req.viewData, viewBag: req.viewBag });
        }

        if (req.session.subdeptid) {
            const deptid = req.session.deptid;
            const subdeptid = req.session.subdeptid;
            const linkID = req.session.linkID;

            await loadDocumentType(deptid, subdeptid, req);
            await loadDocumentAccess(linkID, req);
            
            delete req.session.subdeptid;
            delete req.session.deptid;
            delete req.session.linkID;
            
            return res.render('allocation/index', { viewData: req.viewData, viewBag: req.viewBag });
        }

        const depFirstList = await Department.findOne();
        if (depFirstList) {
            await loadDocumentType(depFirstList.ID, 0, req);
        }

        res.render('allocation/index', { viewData: req.viewData, viewBag: req.viewBag });
    } catch (error) {
        console.error('Error in index route:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/add-subdepartment', async (req, res) => {
    try {
        const { depid, subdepid = 0 } = req.query;
        
        const assignSubDep = await AssignSubdepartment.findAll({
            where: { DepartmentID: depid, Active: true }
        });
        
        const dept = await Department.findOne({ where: { ID: depid } });
    const subDeptList = await SubDepartment.findAll({ where: { Active: true } });
        
        // Filter out assigned subdepartments
        const availableSubDepts = subDeptList.filter(subDept => 
            !assignSubDep.some(assigned => assigned.SubDepartmentID === subDept.ID)
        );

        const viewData = {
            AssignSubDep: assignSubDep,
            SubdepartmentList: availableSubDepts
        };

        const viewBag = {
            Department: dept.Name,
            depid: depid
        };

        if (subdepid !== 0) {
            const subdepartment = await SubDepartment.findOne({ where: { ID: subdepid, Active: true } });
            if (subdepartment) {
                viewBag.Subdepartment = subdepartment.Name;
                viewBag.subdepid = subdepid;
            }
        } else if (availableSubDepts.length > 0) {
            viewBag.Subdepartment = availableSubDepts[0].Name;
            viewBag.subdepid = availableSubDepts[0].ID;
        }

        res.render('allocation/add-subdepartment', { viewData, viewBag });
    } catch (error) {
        console.error('Error in add-subdepartment route:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/save-subdepartment', async (req, res) => {
    try {
        const { depid, subdepid } = req.body;
        
        const checkSubDept = await AssignSubdepartment.findOne({
            where: { DepartmentID: depid, SubDepartmentID: subdepid }
        });
        
        const createdBy = getSessionUsername(req);
        const createdDate = new Date();

        if (checkSubDept) {
            await AssignSubdepartment.update(
                { Active: true, CreatedBy: createdBy, CreatedDate: createdDate },
                { where: { LinkID: checkSubDept.LinkID } }
            );
            
            req.session.linkID = checkSubDept.LinkID.toString();
        } else {
            const LinkID = parseInt(generateLinkID());
            
            await AssignSubdepartment.create({
                LinkID: LinkID,
                DepartmentID: depid,
                SubDepartmentID: subdepid,
                Active: true,
                CreatedBy: createdBy,
                CreatedDate: createdDate
            });

            // Create default fields
            const fieldsToCreate = [];
            
            for (let i = -1; i <= 11; i++) {
                let fieldData;
                if (i === -1) {
                    fieldData = {
                        LinkID: LinkID,
                        FieldNumber: i,
                        Active: true,
                        Description: 'File Description',
                        DataType: 'Text'
                    };
                } else if (i === 0) {
                    fieldData = {
                        LinkID: LinkID,
                        FieldNumber: i,
                        Active: true,
                        Description: 'File Date',
                        DataType: 'Date'
                    };
                } else if (i > 0 && i < 11) {
                    fieldData = {
                        LinkID: LinkID,
                        FieldNumber: i,
                        Active: false,
                        Description: `File Description ${i}`,
                        DataType: 'Text'
                    };
                } else {
                    fieldData = {
                        LinkID: LinkID,
                        FieldNumber: i,
                        Active: false,
                        Description: '5',
                        DataType: 'Number'
                    };
                }
                fieldsToCreate.push(fieldData);
            }

            await Fields.bulkCreate(fieldsToCreate);
            req.session.linkID = LinkID.toString();
        }

        req.session.deptid = depid;
        req.session.subdeptid = subdepid.toString();
        res.redirect('/allocation');
    } catch (error) {
        console.error('Error in save-subdepartment route:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/delete/:linkID', async (req, res) => {
    try {
        const { linkID } = req.params;
        
        await AssignSubdepartment.update(
            { Active: false },
            { where: { LinkID: linkID } }
        );

        res.redirect('/allocation');
    } catch (error) {
        console.error('Error in delete route:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.delete('/delete-user/:depid/:subdepid/:userid', async (req, res) => {
    try {
        const { depid, subdepid, userid

         } = req.params;
        
        await db.AssignSubDepartment.destroy(
            
            {  where: {
                            UserID: userid,
                            DepartmentID: depid,
                            SubDepartmentID: subdepid
                        } }
        );

       return res.json({
            status: true,   
        });
    } catch (error) {
        console.error('Error in delete-user route:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/add-user', async (req, res) => {
    try {
        const { linkid, subdepid, depid, userid = 0 } = req.query;
        const existing = await DocumentAccess.findOne({
            where: {
                UserID: userid,
                DepartmentID: depid,
                SubDepartmentID: subdepid
            }
            });

            if (existing) {
            return res.status(409).json({ error: 'User already assigned to this department and subdepartment' });
            }
        const users = await Users.findAll({ where: { Active: true } });
        const docuAccess = await DocumentAccess.findAll({
            where: { LinkID: linkid, Active: true }
        });
        const subDep = await SubDepartment.findOne({ where: { ID: subdepid } });

        // Filter available users
        const availableUsers = users.filter(user => 
            !docuAccess.some(access => access.UserID === user.ID)
        );

        const viewData = { Users: availableUsers };
        const viewBag = {
            Subdepartment: subDep.Name,
            linkid: linkid,
            depid: depid,
            subdepid: subdepid
        };

        if (userid !== 0) {
            const selectedUser = availableUsers.find(u => u.ID === userid);
            if (selectedUser) {
                viewBag.user = selectedUser.UserName;
                viewBag.userid = userid;
            }
        } else if (availableUsers.length > 0) {
            viewBag.user = availableUsers[0].UserName;
            viewBag.userid = availableUsers[0].ID;
        }

        res.render('allocation/add-user', { viewData, viewBag });
    } catch (error) {
        console.error('Error in add-user route:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/add-user', requireAuth, async (req, res) => {
    try {
        const {
            depid, subdepid, userid,
            View = false, Add = false, Edit = false,
            Delete = false, Print = false, Confidential = false,
            Comment = false, Collaborate = false, Finalize = false, Masking = false,
            fields
        } = req.body;
            const existing = await db.AssignSubDepartment.findOne({
                        where: {
                            UserID: userid,
                            DepartmentID: depid,
                            SubDepartmentID: subdepid
                        }
                        });
                        console.log("ex",existing)
            if (existing) {
            return res.status(409).json({ error: 'User already assigned to this department and subdepartment' });
            }
        const createdBy = req.user.userName || null;
        const subDepartment = await db.AssignSubDepartment.findOne({
            where: { SubDepartmentID: subdepid, DepartmentID: depid, Active: true,UserID:userid }
        });

        const linkid = subDepartment?.LinkID || parseInt(generateLinkID());
        const createdDate = new Date();
        if(!subDepartment){
            await db.AssignSubDepartment.create({
                LinkID: linkid,
                DepartmentID: depid,
                SubDepartmentID: subdepid,
                UserID:userid,
                Active: true,
                CreatedBy: createdBy,
                CreatedDate: createdDate
            });
        }
        const existingAccess = await DocumentAccess.findOne({
            where: { LinkID: linkid, UserID: userid }
        });

        if (existingAccess) {
            await DocumentAccess.update({
                Active: true,
                View: View,
                Add: Add,
                fields:fields,
                Edit: Edit,
                Delete: Delete,
                Print: Print,
                Confidential: Confidential,
                Comment: Comment,
                Collaborate: Collaborate,
                Finalize: Finalize,
                Masking: Masking
            }, {
                where: { LinkID: linkid, UserID: userid }
            });
        } else {
            await DocumentAccess.create({
                LinkID: linkid,
                UserID: userid,
                View: View,
                Add: Add,
                Edit: Edit,
                fields:fields,
                Delete: Delete,
                Print: Print,
                Confidential: Confidential,
                Comment: Comment,
                Collaborate: Collaborate,
                Finalize: Finalize,
                Masking: Masking,
                Active: true,
                CreatedBy: createdBy,
                CreatedDate: createdDate
            });
        }

        res.json({
            status: true,
        });
    } catch (error) {
        console.error('Error in add-user POST route:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/edit-user', async (req, res) => {
    try {
        const { depid, subdepid, linkid } = req.query;
        
        const depName = await Department.findOne({ where: { ID: depid } });
        const subDepName = await SubDepartment.findOne({ where: { ID: subdepid } });
        
        req.viewBag = {
            depname: depName.Name,
            subdepname: subDepName.Name,
            linkid: linkid,
            depid: depid,
            subdepid: subdepid
        };

        await loadDocumentAccess(linkid, req);
        
        res.render('allocation/edit-user', { viewData: req.viewData, viewBag: req.viewBag });
    } catch (error) {
        console.error('Error in edit-user route:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/edit-user', async (req, res) => {
    try {
        const { userID, linkid
            ,view, add, edit, delete: deleteAccess, print, confidential, comment, collaborate, finalize, masking


         } = req.body;
        
        const selectedUsers = await DocumentAccess.findOne({
            where: { LinkID: linkid, UserID: userID }
        });
        console.log("selectedUsers",selectedUsers)
        if (selectedUsers) {
           

            await DocumentAccess.update({
                View: view,
                Add: add,
                Edit: edit,
                Delete: deleteAccess,
                Print: print,
                Confidential: confidential,
                Comment: comment,
                Collaborate: collaborate,
                Finalize: finalize,
                Masking: masking
            }, {
                where: { LinkID: linkid, UserID: userID }
            });
        }

        return res.json({
            status: true,
        });
    } catch (error) {
        console.error('Error in edit-user POST route:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/cbx-department', async (req, res) => {
    try {
        const { depid } = req.body;
        req.session.depid = depid;
        res.redirect('/allocation');
    } catch (error) {
        console.error('Error in cbx-department route:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/search', async (req, res) => {
    try {
        const { inputValue } = req.body;
        
        if (!inputValue) {
            return res.redirect('/allocation');
        }

        const nameDepartments = await Department.findAll({
            where: {
                Name: { [Op.like]: `%${inputValue}%` }
            }
        });

        const codeDepartments = await Department.findAll({
            where: {
                Code: { [Op.like]: `%${inputValue}%` }
            }
        });

        // Combine and remove duplicates
        const allDepartments = [...nameDepartments, ...codeDepartments];
        const uniqueDepartments = allDepartments.filter((dept, index, self) => 
            index === self.findIndex(d => d.ID === dept.ID)
        );

        req.session.FinalList = JSON.stringify(uniqueDepartments);
        res.redirect('/allocation');
    } catch (error) {
        console.error('Error in search route:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/fields', async (req, res) => {
    try {
        const viewBag = {};
        const viewData = {};
        
        if (req.session.alert) {
            viewBag.alert = req.session.alert;
            delete req.session.alert;
        }

        if (req.session.linkid) {
            const linkid = req.session.linkid;
            const depid = req.session.depid;
            const subdepid = req.session.subdepid;

            const department = await Department.findOne({ where: { ID: depid } });
            const subdepartment = await SubDepartment.findOne({ where: { ID: subdepid, Active: true } });
            const fields = await Fields.findAll({ where: { LinkID: linkid } });

            viewBag.depid = depid;
            viewBag.subdepid = subdepid;
            viewBag.linkid = linkid;

            fields.forEach(field => {
                if (field.FieldNumber === -1) {
                    viewBag.fileDesc = field.Description;
                } else if (field.FieldNumber === 0) {
                    viewBag.fileDate = field.Description;
                } else if (field.FieldNumber >= 1 && field.FieldNumber <= 10) {
                    viewData[`input${field.FieldNumber}`] = field.Description;
                    viewData[`active${field.FieldNumber}`] = field.Active;
                    viewData[`dType${field.FieldNumber}`] = field.DataType;
                } else if (field.FieldNumber === 11) {
                    viewData.active11 = field.Active;
                    viewData.input11 = field.Description;
                }
            });

            viewBag.depname = department.Name;
            viewBag.subdepname = subdepartment.Name;
            
            delete req.session.linkid;
            delete req.session.depid;
            delete req.session.subdepid;
        } else {
            return res.redirect('/allocation');
        }

        res.render('allocation/fields', { viewData, viewBag });
    } catch (error) {
        console.error('Error in fields route:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/load-fields', async (req, res) => {
    try {
        const { depid, subdepid, linkid } = req.query;
        
        req.session.depid = depid;
        req.session.subdepid = subdepid.toString();
        req.session.linkid = linkid.toString();
        
        res.redirect('/allocation/fields');
    } catch (error) {
        console.error('Error in load-fields route:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/load-fields', async (req, res) => {
    try {
        const { depid, subdepid, linkid } = req.body;

        for (let i = -1; i <= 11; i++) {
            let updateData = {};
            
            if (i === -1 || i === 0) {
                updateData.Description = req.body[`input${i}`];
            } else if (i === 11) {
                updateData.Description = req.body[`input${i}`];
                updateData.DataType = 'Number';
                updateData.Active = req.body[`active${i}`] === 'true';
            } else {
                updateData.Description = req.body[`input${i}`];
                updateData.DataType = req.body[`dType${i}`];
                updateData.Active = req.body[`active${i}`] === 'true';
            }

            await Fields.update(updateData, {
                where: { LinkID: linkid, FieldNumber: i }
            });
        }

        req.session.alert = "<span class='text-success'>Fields updated</span>";
        req.session.depid = depid;
        req.session.subdepid = subdepid.toString();
        req.session.linkid = linkid.toString();
        
        res.redirect('/allocation/fields');
    } catch (error) {
        console.error('Error in load-fields POST route:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
//get documeent access based on department and subdepartment
router.get('/document-access', async (req, res) => {
    try {
        const { depid, subdepid,userid } = req.body;
        
        if (!depid || !subdepid ) {
            return res.status(400).json({ error: 'Missing required parameters' });
        }

        const assingedSubDep = await AssignSubdepartment.findOne({
            where: { DepartmentID: depid, SubDepartmentID: subdepid,UserID:userid, Active: true }
        });
        if (!assingedSubDep) {
            return res.status(404).json({ status: false, message: 'Assigned sub-department not found' });
        }
        const linkID = assingedSubDep.LinkID;
        const docuAccess = await DocumentAccess.findAll({
            where: { LinkID: linkID, Active: true },
            include: [{
                model: Users,
                attributes: ['ID', 'UserName'] // Include only necessary user fields
            }]
        });
        const newassingedsubdep=JSON.parse(JSON.stringify(assingedSubDep))
        newassingedsubdep.docuAccess=docuAccess
        res.json({
            status: true,
            documentAccess: newassingedsubdep
        });
    } catch (error) {
        console.error('Error in document-access route:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});


//get document access based on department and subdepartment
// make new function
router.get('/existing-users', async (req, res) => {
    try {
        // const assignedSubDeps = await AssignSubdepartment.findAll({
        //     where: { Active: true },
        // });
        const assignedSubDeps = await AssignSubdepartment.findAll();

        res.json({
            status: true,
            data: assignedSubDeps
        });
    } catch (error) {
        console.error('Error fetching existing users:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.delete('/delete-existing-user', async (req, res) => {
    try {
        const { depid, subdepid, userid } = req.query;

        await db.AssignSubDepartment.destroy(
            
            {  where: {
                            UserID: userid,
                            DepartmentID: depid,
                            SubDepartmentID: subdepid
                        } }
        );

       return res.json({
            status: true,
        });
    } catch (error) {
        console.error('Error in delete-user route:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});


// Return available fields from Fields table for allocation
// Route shape expected by frontend: /allocation/available-fields/:docTypeId/:linkId
router.get('/available-fields/:docTypeId/:linkId', async (req, res) => {
    try {
        const { linkId } = req.params;
        const fields = await Fields.findAll({
            where: { LinkID: linkId },
            order: [['FieldNumber', 'ASC']]
        });
        return res.json({ status: true, data: fields });
    } catch (error) {
        console.error('Error fetching available fields:', error);
        return res.status(500).json({ status: false, error: 'Failed to fetch available fields' });
    }
});

// GET allocations by LinkID - /allocation/by-link/:id
router.get('/by-link/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { includeInactive } = req.query;
        
        const where = { LinkID: id };
        if (includeInactive !== 'true') {
            where.Active = true;
        }
        
        const allocations = await DocumentAccess.findAll({
            where,
            include: [{
                model: Users,
                attributes: ['ID', 'UserName', 'Active']
            }],
            order: [['CreatedDate', 'DESC']]
        });
        
        return res.json({ status: true, data: allocations });
    } catch (error) {
        console.error('Error fetching allocations by link:', error);
        return res.status(500).json({ status: false, error: 'Failed to fetch allocations by link' });
    }
});

// GET allocations by Department and SubDepartment - /allocation/by-dept/:deptId/:subDeptId
router.get('/by-dept/:deptId/:subDeptId', async (req, res) => {
    try {
        const { deptId, subDeptId } = req.params;
        const { includeInactive } = req.query;
        
        // Find ALL assigned subdepartment records (may have multiple UserIDs with different LinkIDs)
        const assignedSubDeps = await AssignSubdepartment.findAll({
            where: { 
                DepartmentID: deptId, 
                SubDepartmentID: subDeptId, 
                Active: true 
            }
        });
        
        if (!assignedSubDeps || assignedSubDeps.length === 0) {
            return res.json({ status: true, data: [] }); // Return empty array if no assignment found
        }
        
        // Get all unique LinkIDs from the assigned subdepartments
        const linkIDs = [...new Set(assignedSubDeps.map(item => item.LinkID))];
        
        const where = { 
            LinkID: { [Op.in]: linkIDs }
        };
        if (includeInactive !== 'true') {
            where.Active = true;
        }
        
        const allocations = await DocumentAccess.findAll({
            where,
            include: [{
                model: Users,
                attributes: ['ID', 'UserName', 'Active']
            }],
            order: [['CreatedDate', 'DESC']]
        });
        
        return res.json({ status: true, data: allocations });
    } catch (error) {
        console.error('Error fetching allocations by dept:', error);
        return res.status(500).json({ status: false, error: 'Failed to fetch allocations by dept' });
    }
});

// GET allocations by Department and SubDepartment (query params) - /allocation/by-dept?deptId=29&subDeptId=24
router.get('/by-dept', async (req, res) => {
    try {
        const { deptId, subDeptId } = req.query;
        const { includeInactive } = req.query;
        
        if (!deptId || !subDeptId) {
            return res.status(400).json({ status: false, error: 'Missing required parameters: deptId and subDeptId' });
        }
        
        // Find ALL assigned subdepartment records (may have multiple UserIDs with different LinkIDs)
        const assignedSubDeps = await AssignSubdepartment.findAll({
            where: { 
                DepartmentID: deptId, 
                SubDepartmentID: subDeptId, 
                Active: true 
            }
        });
        
        if (!assignedSubDeps || assignedSubDeps.length === 0) {
            return res.json({ status: true, data: [] }); // Return empty array if no assignment found
        }
        
        // Get all unique LinkIDs from the assigned subdepartments
        const linkIDs = [...new Set(assignedSubDeps.map(item => item.LinkID))];
        
        const where = { 
            LinkID: { [Op.in]: linkIDs }
        };
        if (includeInactive !== 'true') {
            where.Active = true;
        }
        
        const allocations = await DocumentAccess.findAll({
            where,
            include: [{
                model: Users,
                attributes: ['ID', 'UserName', 'Active']
            }],
            order: [['CreatedDate', 'DESC']]
        });
        
        return res.json({ status: true, data: allocations });
    } catch (error) {
        console.error('Error fetching allocations by dept (query):', error);
        return res.status(500).json({ status: false, error: 'Failed to fetch allocations by dept' });
    }
});

// GET allocation by User, Department and SubDepartment - /allocation/user/:userId/:deptId/:subDeptId
router.get('/user/:userId/:deptId/:subDeptId', async (req, res) => {
    try {
        const { userId, deptId, subDeptId } = req.params;
        const { includeInactive } = req.query;
        
        // Find the assigned subdepartment to get the LinkID
        const assignedSubDep = await AssignSubdepartment.findOne({
            where: { 
                DepartmentID: deptId, 
                SubDepartmentID: subDeptId, 
                Active: true 
            }
        });
        
        if (!assignedSubDep) {
            return res.json({ status: true, data: null }); // Return null if no assignment found
        }
        
        const linkID = assignedSubDep.LinkID;
        const where = { 
            LinkID: linkID, 
            UserID: userId 
        };
        if (includeInactive !== 'true') {
            where.Active = true;
        }
        
        const allocation = await DocumentAccess.findOne({
            where,
            include: [{
                model: Users,
                attributes: ['ID', 'UserName', 'Active']
            }]
        });
        
        return res.json({ status: true, data: allocation });
    } catch (error) {
        console.error('Error fetching allocation by user and dept:', error);
        return res.status(500).json({ status: false, error: 'Failed to fetch allocation by user and dept' });
    }
});

// GET all allocations - /allocation/all
router.get('/all', async (req, res) => {
    try {
        const { includeInactive } = req.query;
        
        const where = {};
        if (includeInactive !== 'true') {
            where.Active = true;
        }
        
        const allocations = await DocumentAccess.findAll({
            where,
            include: [{
                model: Users,
                attributes: ['ID', 'UserName', 'Active']
            }],
            order: [['CreatedDate', 'DESC']]
        });
        
        return res.json({ status: true, data: allocations });
    } catch (error) {
        console.error('Error fetching all allocations:', error);
        return res.status(500).json({ status: false, error: 'Failed to fetch all allocations' });
    }
});

// PUT update allocation by ID - /allocation/update/:id
router.put('/update/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            View,
            Add,
            Edit,
            Delete,
            Print,
            Confidential,
            Comment,
            Collaborate,
            Finalize,
            Masking,
            Active,
            fields,
            LinkID,
            UserID
        } = req.body;

        let allocation = null;

        // DocumentAccess doesn't have an auto-increment ID, so we need LinkID + UserID to identify
        // Try multiple ways to find the allocation:
        
        // 1. If LinkID and UserID are provided in body, use them (most reliable)
        if (LinkID && UserID) {
            allocation = await DocumentAccess.findOne({
                where: { LinkID: LinkID, UserID: UserID }
            });
        }

        // 2. Try findByPk if there's a potential auto-generated ID (some DBs might have this)
        if (!allocation) {
            try {
                allocation = await DocumentAccess.findByPk(id);
            } catch (err) {
                // findByPk might fail if no ID column, continue to other methods
            }
        }

        // 3. Try to find by LinkID if id might be a LinkID
        if (!allocation) {
            allocation = await DocumentAccess.findOne({
                where: { LinkID: id }
            });
        }

        // 4. If still not found and we have UserID in body, try LinkID from body with UserID
        if (!allocation && LinkID && UserID) {
            allocation = await DocumentAccess.findOne({
                where: { LinkID: LinkID, UserID: UserID }
            });
        }

        if (!allocation) {
            return res.status(404).json({ 
                status: false, 
                error: 'Allocation not found',
                hint: 'Please provide LinkID and UserID in the request body'
            });
        }

        // Prepare update data
        const updateData = {};
        if (View !== undefined) updateData.View = View;
        if (Add !== undefined) updateData.Add = Add;
        if (Edit !== undefined) updateData.Edit = Edit;
        if (Delete !== undefined) updateData.Delete = Delete;
        if (Print !== undefined) updateData.Print = Print;
        if (Confidential !== undefined) updateData.Confidential = Confidential;
        if (Comment !== undefined) updateData.Comment = Comment;
        if (Collaborate !== undefined) updateData.Collaborate = Collaborate;
        if (Finalize !== undefined) updateData.Finalize = Finalize;
        if (Masking !== undefined) updateData.Masking = Masking;
        if (Active !== undefined) updateData.Active = Active;
        if (fields !== undefined) updateData.fields = fields;

        // Update the allocation
        await allocation.update(updateData);

        // Fetch the updated allocation with user info
        const updatedAllocation = await DocumentAccess.findOne({
            where: { 
                LinkID: allocation.LinkID, 
                UserID: allocation.UserID 
            },
            include: [{
                model: Users,
                attributes: ['ID', 'UserName', 'Active']
            }]
        });

        return res.json({ 
            status: true, 
            data: updatedAllocation,
            message: 'Allocation updated successfully' 
        });
    } catch (error) {
        console.error('Error updating allocation:', error);
        return res.status(500).json({ status: false, error: 'Failed to update allocation', details: error.message });
    }
});


module.exports = router;