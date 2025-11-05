const express = require('express');
const bcrypt = require('bcrypt');
const { body, validationResult } = require('express-validator');
const db=require('../config/database'); // Adjust the path as necessary
const Users = db.Users
const UserAccess=db.UserAccess
const router = express.Router();
const requireAuth = require('../middleware/requireAuth'); 
// GET /create
router.get('/create', async (req, res) => {
    try {
        const userAccessList = await UserAccess.findAll();
        res.render('users/create', {
            userAccessList,
            username: req.session.username,
            errors: {},
            user: {}
        });
    } catch (error) {
        console.error('Error in create GET:', error);
        res.status(500).render('error', { error });
    }
});

// GET /
router.get('/',requireAuth, async (req, res) => {
    try {
        console.log("=== Route Handler Started ===");
    console.log("Request URL:", req.originalUrl);
    console.log("Request Method:", req.method);
        console.log("req.user====>",req.user)
        let usersList;

        // Check if there's filtered data in session
        if (req?.user?.finalList) {
            usersList = req?.user?.finalList;
            
            // Add UserAccess descriptions
            for (let user of usersList) {
                const userAccess = await UserAccess.findByPk(user.userAccessID);
                user.userAccess = userAccess ? userAccess.description : null;
            }
            
            // Clear the session data after use
            delete req.user.finalList;
        } else {
            // Fetch all active users with their access levels
            usersList = await Users.findAll({
                where: { Active: true },

                 include: [{
                    model: UserAccess,
                    include:[
                        {
                            model:db.ModuleAccess,
                            as:"moduleAccess"
                        }
                    ],
                    as: 'accessList'
                }]
                // include: [{
                //     model: UserAccess,
                //     as: 'userAccess',
                //     include: [{
                //         model: db.ModuleAccess, // Assuming you have a ModuleAccess model
                //         as: 'moduleAccess',
                //         include: [{
                //             model: db.Module, // Assuming you have a Module model   
                //             as: 'module',
                //         }]
                //     }]
                // }],
                
            });
            // console.log("usersList",usersList)
            // // Transform to match the expected format
            // usersList = usersList.map(user => ({
            //     id: user.ID,
            //     employeeID: user.EmployeeID,
            //     userName: user.UserName,
            //     password: user.Password,
            //     userAccessID: user.UserAccessID,
            //     userAccess: user.userAccess ? user.userAccess.description : null,
            //     active: user.active,
            //     createdBy: user.createdBy,
            //     createdDate: user.createdDate
            // }));
        }
        console.log("req.user",req.user)
        res.json( {
            users: usersList,
            username: req.user.username
        });
    } catch (error) {
        console.error('Error in index:', error);
        res.status(500).json({
            status:false
        });
    }
});




// router.get('/', requireAuth, async (req, res) => {
//     console.log("=== Route Handler Started ===");
//     console.log("Request URL:", req.originalUrl);
//     console.log("Request Method:", req.method);
    
//     try {
//         console.log("Checking req.user...");
//         console.log("req.user exists?", !!req.user);
//         console.log("req.user:", req.user);
//         console.log("typeof req.user:", typeof req.user);
        
//         // Check all properties on req object
//         console.log("All req properties containing 'user':");
//         Object.keys(req).forEach(key => {
//             if (key.toLowerCase().includes('user')) {
//                 console.log(`req.${key}:`, req[key]);
//             }
//         });
        
//         // Check if user data exists anywhere else
//         console.log("req.headers:", req.headers);
        
//         if (!req.user) {
//             console.log("req.user is null/undefined - this is the problem!");
//             return res.status(401).json({ error: 'User not authenticated' });
//         }
        
//         console.log("Success! req.user is available:", req.user);
//         res.json({
//             message: 'Success',
//             user: req.user
//         });
        
//     } catch (error) {
//         console.error('Route error:', error);
//         res.status(500).json({ error: 'Internal server error' });
//     }
// });


// GET /delete/:id (soft-delete only active users)
router.get('/delete/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        // Only find active users to avoid re-deleting inactive ones
        const user = await Users.findOne({
            where:{
                ID:id,
                Active: true
            }
        });
        console.log("user",user)
        if (!user) {
            return res.json({
                status:false,
                message:"User not found"
            })
        }

        // Soft delete - set active to false
        await Users.update({ Active: false },{where:{ID:id}});
        
        res.json({
            message:"deleted"
        });
    } catch (error) {
        console.error('Error in delete:', error);
        res.status(500).render('error', { error });
    }
});

router.delete('/delete/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);

        // Soft delete instead of hard destroy: set Active = false
        const [updated] = await Users.update(
            { Active: false },
            { where: { ID: id } }
        );

        if (updated === 0) {
            return res.status(404).json({ status: false, message: 'User not found' });
        }

        res.json({
            status: true,
            message: "User deleted"
        });
    } catch (error) {
        console.error('Error in delete:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /edit/:id — only allow editing active users
router.get('/edit/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        
        if (!id) {
            return res.status(404).render('error', { 
                error: { message: 'User not found' } 
            });
        }

        // Only fetch user if active
        const user = await Users.findOne({ where: { ID: id, Active: true } });
        if (!user) {
            return res.status(404).render('error', { 
                error: { message: 'User not found' } 
            });
        }

        const userAccess = await UserAccess.findByPk(user.userAccessID);
        if (userAccess) {
            user.userAccess = userAccess.description;
        }

        // Store original data in session for comparison during update
        req.session.editUserData = {
            employeeID: user.employeeID,
            originalUserName: user.userName,
            userAccessID: user.userAccessID,
            password: user.password,
            active: user.active,
            createdBy: user.createdBy,
            createdDate: user.createdDate
        };

        const userAccessList = await UserAccess.findAll();

        res.json({
            user: user.toJSON(),
            userAccessList,
            errors: {},
            username: req.session.username
        });
    } catch (error) {
        console.error('Error in edit GET:', error);
        res.status(500).render('error', { error });
    }
});

// POST /create
router.post('/create', [
    body('userName').notEmpty().withMessage('Please Input a User Name'),
    body('password').notEmpty().withMessage('Please Input a Password'),
    body('cpassword').custom((value, { req }) => {
        if (value !== req.body.password) {
            throw new Error('Passwords do not match');
        }
        return true;
    })
], async (req, res) => {
    try {
        const errors = validationResult(req);
        const { userName, password, userAccessID } = req.body;

        let validationErrors = {};
        
        if (!errors.isEmpty()) {
            errors.array().forEach(error => {
                validationErrors[error.param] = error.msg;
            });
        }

        // Check if username already exists
        const existingUser = await Users.findOne({ where: { userName } });
        if (existingUser) {
            validationErrors.userName = 'This User Name already exists';
        }

        if (Object.keys(validationErrors).length > 0) {
            const userAccessList = await UserAccess.findAll();
            return res.render('users/create', {
                userAccessList,
                errors: validationErrors,
                user: req.body,
                username: req.session.username
            });
        }

        // Hash the password
        const hashedPassword = await encryptPassword(password);

        // Create new user
        await Users.create({
            employeeID: 0,
            userName,
            password: hashedPassword,
            userAccessID: parseInt(userAccessID),
            active: true,
            createdBy: req.session.username,
            createdDate: new Date()
        });

        res.json({
            message:"success"
        });

    } catch (error) {
        console.error('Error in create POST:', error);
        res.status(500).render('error', { error });
    }
});

// POST /edit
router.post('/edit', [
    body('userName').notEmpty().withMessage('Please Input a User Name'),
    body('cpassword').custom((value, { req }) => {
        if (req.body.password && value !== req.body.password) {
            throw new Error('Passwords do not match');
        }
        if (req.body.password && !value) {
            throw new Error('Please confirm your password');
        }
        return true;
    })
], async (req, res) => {
    try {
        const errors = validationResult(req);
        const { id, userName, password, userAccessArray } = req.body;
        // const editData = req.session.editUserData;

        // if (!editData) {
        //     return res.redirect('/users');
        // }

        let validationErrors = {};
        
        if (!errors.isEmpty()) {
            errors.array().forEach(error => {
                validationErrors[error.param] = error.msg;
            });
        }

        // Check if username already exists (excluding current user)
        const existingUser = await Users.findOne({ 
            where: { 
                userName,
                id: { [require('sequelize').Op.ne]: parseInt(id) }
            }
        });
        
        if (existingUser) {
            validationErrors.userName = 'This User Name already exists';
        }

        let parseArray;

        try {
            parseArray = JSON.parse(userAccessArray);
        } catch {
            parseArray = userAccessArray;
        }

        console.log("userAccessArray", userAccessArray);

        // 🔴 Delete all previous accesses for this user
        await db.UserUserAccess.destroy({
            where: { UserID: id }
        });

        // 🟢 Now create new ones
        for (let i = 0; i < parseArray.length; i++) {
            await db.UserUserAccess.create({
                UserID: id,
                UserAccessID: parseArray[i]
            });
        }


        // Prepare update data
        const updateData = {
            UserName: userName,
            userAccessArray: userAccessArray || [], 
            
           
        };

        // Update password if provided
        if (password && password.trim() !== '') {
            updateData.Password = await encryptPassword(password);
        }
        console.log("updateData",updateData)
        await Users.update(updateData, {
            where: { ID: parseInt(id) }
        });
        
        // Clear session data
        return res.json({
            status:true,
            message: "User updated successfully",
           
        });

    } catch (error) {
        console.error('Error in edit POST:', error);
        res.status(500).json({ error });
    }
});

// Helper function to encrypt password
async function encryptPassword(password) {
    const saltRounds = 10;
    return await bcrypt.hash(password, saltRounds);
}

// Helper function to verify password
async function verifyPassword(password, hashedPassword) {
    return await bcrypt.compare(password, hashedPassword);
}

module.exports = router;