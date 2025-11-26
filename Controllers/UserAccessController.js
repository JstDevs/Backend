const express = require('express');
const { body, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const db = require('../config/database'); // Adjust path as needed
const requireAuth = require('../middleware/requireAuth'); // Your auth middleware

const router = express.Router();

// Assuming your Sequelize models
const { UserAccess, Module, ModuleAccess } = db;

// GET /useraccess - Index/List view
router.get('/', requireAuth, async (req, res) => {
    try {
       const userAccess = await db.UserAccess.findAll({
            where: { Active: true },
            include: [{ model: db.ModuleAccess,
                as: 'moduleAccess',
                include: [{
                    model: db.Module,
                    as: 'module'
                }]
             }],
            order: [['Description', 'ASC']]
        });

       

        res.json({
            success: true,
            data: {
                userAccess,
               
            }
        });

    } catch (error) {
        console.error('UserAccess Index Error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

// GET /useraccess/edit/:userid - Get user access data for editing
router.get('/edit/:userid', requireAuth, async (req, res) => {
    try {
        const { userid } = req.params;
        const { description } = req.query;

        const moduleAccess = await ModuleAccess.findAll({
            where: { UAID: userid, Active: true },
            order: [['ModuleID', 'ASC']]
        });

        const userAccess = await UserAccess.findAll({ where: { Active: true } });
        const modules = await Module.findAll();

        res.json({
            success: true,
            data: {
                moduleAccess,
                userAccess,
                modules,
                selectedUser: {
                    id: userid,
                    description
                }
            }
        });

    } catch (error) {
        console.error('UserAccess Edit Get Error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

// PUT /useraccess/edit/:userid - Update user access
router.put('/edit/:userid', requireAuth, [
    body('description').notEmpty().withMessage('Description is required')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Validation errors',
                errors: errors.array()
            });
        }

        const { userid } = req.params;
        const { description: newDescription, modulePermissions } = req.body;
        const currentDescription = req.body.currentDescription;

        // Check if name already exists (excluding current user)
        const existingUser = await UserAccess.findOne({
            where: {
                Description: newDescription,
                ID: { [Op.ne]: userid }
            }
        });

        // if (existingUser) {
        //     return res.status(400).json({
        //         success: false,
        //         message: 'Name Already Exists'
        //     });
        // }

        // Update user description if provided
        if (newDescription && newDescription !== currentDescription) {
            await UserAccess.update(
                { Description: newDescription },
                { where: { ID: userid } }
            );
        }

        // Update module permissions
        if (modulePermissions && Array.isArray(modulePermissions)) {
            // for (const permission of modulePermissions) {
            //     await ModuleAccess.update(
            //         {
            //             View: permission.view || false,
            //             Add: permission.add || false,
            //             Edit: permission.edit || false,
            //             Delete: permission.delete || false,
            //             Print: permission.print || false
            //         },
            //         {
            //             where: {
            //                 UAID: userid,
            //                 ModuleID: permission.ID
            //             }
            //         }
            //     );
            // }

            for (const permission of modulePermissions) {
                const [record, created] = await ModuleAccess.findOrCreate({
                where: {
                    UAID: userid,
                    ModuleID: permission.ID
                },
                defaults: {
                    View: permission.view || false,
                    Add: permission.add || false,
                    Edit: permission.edit || false,
                    Delete: permission.delete || false,
                    Print: permission.print || false
                }
                });

                if (!created) {
                // If already exists, update it
                await record.update({
                    View: permission.view || false,
                    Add: permission.add || false,
                    Edit: permission.edit || false,
                    Delete: permission.delete || false,
                    Print: permission.print || false
                });
                }
            }

        }

        res.json({
            success: true,
            message: 'User Access Successfully Updated'
        });

    } catch (error) {
        console.error('UserAccess Edit Error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error
        });
    }
});

// GET /useraccess/add - Get modules for add form
router.get('/add', requireAuth, async (req, res) => {
    try {
        const modules = await Module.findAll({
            order: [['ID', 'ASC']]
        });

        res.json({
            success: true,
            data: {
                modules
            }
        });

    } catch (error) {
        console.error('UserAccess Add Get Error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

// POST /useraccess/add - Create new user access
router.post('/add',async (req, res) => {
    try {
        // const errors = validationResult(req);
        // if (!errors.isEmpty()) {
        //     return res.status(400).json({
        //         success: false,
        //         message: 'Validation errors',
        //         errors: errors.array()
        //     });
        // }

        const { description, modulePermissions } = req.body;

        // Check if description already exists
        const existingUser = await db.UserAccess.findOne({
            where: { Description: description }
        });

        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'User Description Already Exists'
            });
        }

        // Create new user access
        const createdBy=req?.user?.userName? req?.user?.userName : "System";
        const newUserAccess = await db.UserAccess.create({
            Description: description,
            Createdby: createdBy,
            CreatedDate: new Date(),
            Active:true
        });

        // Get all modules
        const modules = await db.Module.findAll({
            order: [['ID', 'ASC']]
        });

        // Create module access entries for the new user
        const moduleAccessEntries = modules.map((module, index) => {
            const permissions = modulePermissions && modulePermissions[index] ? modulePermissions[index] : {};
            console.log("permissions", permissions);
            return {
                UAID: newUserAccess.ID,
                ModuleID: module.ID,
                View: permissions.view || false,
                Add: permissions.add || false,
                Edit: permissions.edit || false,
                Delete: permissions.delete || false,
                Print: permissions.print || false
            };
        });
        console.log("moduleAccessEntries", moduleAccessEntries);
        await db.ModuleAccess.bulkCreate(moduleAccessEntries);

        res.status(201).json({
            success: true,
            message: 'User Access Successfully Created',
            data: {
                id: newUserAccess.ID,
                description: newUserAccess.Description
            }
        });

    } catch (error) {
        console.error('UserAccess Add Error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

// DELETE /useraccess/:userid - Delete user access
router.delete('/:userid', requireAuth, async (req, res) => {
    try {
        const { userid } = req.params;

        const accessUsed = await db.UserUserAccess.findOne({
            where: {UserAccessID: userid}
        })

        if (accessUsed) {
            console.log('Text 000')
            return res.json({
                success: false,
                inUse: true,
                message: 'Access is currently in use ! ! !'
            })
        }

        console.log('Text 1')

        // Find the user access record
        const userAccess = await db.UserAccess.findByPk(userid);
            
        if (!userAccess) {
            console.log('Text 12')
            return res.status(404).json({
                success: false,
                message: 'User Access not found'
            });
        }
        console.log('Text 123')

        // Soft-delete: mark module access entries and the user access record inactive
        await db.ModuleAccess.update(
            { Active: false },
            { where: { UAID: userid } }
        );

        const [updated] = await db.UserAccess.update(
            { Active: false },
            { where: { ID: userid } }
        );

        if (updated === 0) {
            return res.status(404).json({
                success: false,
                message: 'User Access not found'
            });
        }

        res.json({
            success: true,
            message: 'User Access Successfully Deleted'
        });

    } catch (error) {
        console.error('UserAccess Delete Error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

// GET /useraccess/search - Search user access by description
router.get('/search/:query', requireAuth, async (req, res) => {
    try {
        const { query } = req.params;

        if (!query) {
            return res.json({
                success: true,
                data: {
                    userAccess: [],
                    message: 'No search query provided'
                }
            });
        }

        const userAccess = await db.UserAccess.findAll({
            where: {
                Description: {
                    [Op.like]: `%${query}%`
                },
                Active: true
            }
        });

        let moduleAccess = [];
        let selectedUser = {};

        if (userAccess.length > 0) {
            const firstUser = userAccess[0];
            moduleAccess = await db.ModuleAccess.findAll({
                where: { UAID: firstUser.ID, Active: true },
                order: [['ModuleID', 'ASC']],
                include:[{model:db.Module,as:"module"}]
            });
            selectedUser = {
                id: firstUser.ID,
                description: firstUser.Description
            };
        }

        const modules = await db.Module.findAll();

        res.json({
            success: true,
            data: {
                userAccess,
                moduleAccess,
                modules,
                selectedUser
            }
        });

    } catch (error) {
        console.error('UserAccess Search Error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});
router.post('/modules', async (req, res) => {
  try {
    const module = await Module.create(req.body);
    res.status(201).json(module);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// READ ALL
router.get('/modules', async (req, res) => {
  try {
    const modules = await Module.findAll();
    res.json(modules);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// READ ONE
router.get('/modules', async (req, res) => {
  try {
    const module = await Module.findAll();
    if (module) {
      res.json(module);
    } else {
      res.status(404).json({ error: 'Module not found' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// UPDATE
router.put('/modules/:id', async (req, res) => {
  try {
    const [updated] = await Module.update(req.body, {
      where: { ID: req.params.id }
    });
    if (updated) {
      const updatedModule = await Module.findByPk(req.params.id);
      res.json(updatedModule);
    } else {
      res.status(404).json({ error: 'Module not found' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE
router.delete('/modules/:id', async (req, res) => {
  try {
    const deleted = await Module.destroy({
      where: { ID: req.params.id }
    });
    if (deleted) {
      res.json({ message: 'Module deleted' });
    } else {
      res.status(404).json({ error: 'Module not found' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
module.exports = router;