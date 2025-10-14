// routes/auth.js
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const db=require('../config/database'); // Adjust the path as necessary
const Users = db.Users
const UserAccess=db.UserAccess
const requireAuth = require('../middleware/requireAuth'); // Assuming you have a middleware for authentication
const router = express.Router();

// JWT Secret (should be in environment variables)
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

// Helper function to hash password
const hashPassword = async (password) => {
    const saltRounds = 12;
    return await bcrypt.hash(password, saltRounds);
};

// Helper function to verify password
const verifyPassword = async (password, hashedPassword) => {
    return await bcrypt.compare(password, hashedPassword);
};

// Generate JWT token
const generateToken = (user) => {
    return jwt.sign(
        { 
            id: user.ID,
            userName: user.UserName,
            userAccessID: user.UserAccessID,
            employeeID: user.EmployeeID
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );
};

// Verify JWT token
const verifyToken = (token) => {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (error) {
        return null;
    }
};

// GET /auth/login - Show login form
router.get('/login', (req, res) => {
    // If user is already logged in, redirect to dashboard
    if (req.session.user) {
        return res.redirect('/dashboard');
    }
    
    res.render('auth/login', {
        errors: {},
        message: req.query.message || null
    });
});

// POST /auth/login - Process login
router.post('/login', [
    body('userName')
        .notEmpty()
        .withMessage('Username is required')
        .trim(),
    body('password')
        .notEmpty()
        .withMessage('Password is required')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        const { userName, password, rememberMe } = req.body;

        if (!errors.isEmpty()) {
            const validationErrors = {};
            errors.array().forEach(error => {
                validationErrors[error.param] = error.msg;
            });

            return res.json({
                status: false,
                errors: validationErrors,
                userName,
                message: null
            });
        }

        // Find user by username
        const user = await Users.findOne({
            where: { 
                UserName: userName,
                Active: true
            },
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
        });

        if (!user) {
            return res.json({
                status: false,
                errors: { general: 'Invalid username or password' },
                userName,
                message: null
            });
        }

        // Verify password
        const isValidPassword = await verifyPassword(password, user.Password);
        if (!isValidPassword) {
            return res.json({
                status: false,
                errors: { general: 'Invalid username or password' },
                userName,
                message: null
            });
        }

        // Create user session data
        const sessionUser = {
            id: user.ID,
            employeeID: user.EmployeeID,
            userName: user.UserName,
            userAccessID: user.UserAccessID,
            userAccess: user.userAccess ? user.userAccess.Description : null,
            loginTime: new Date()
        };

        // Set session data
        // req.session.user = sessionUser;
        // req.session.username = user.UserName; // For compatibility with existing code
        // req.session.isAuthenticated = true;

        // Generate JWT token if remember me is checked
        let token = null;
        if (1) {
            token = generateToken(user);
            
            // Set JWT as httpOnly cookie
            res.cookie('authToken', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                maxAge: 24 * 60 * 60 * 1000, // 24 hours
                sameSite: 'strict'
            });
        }

        // Update last login (optional)
        await Users.update(
            { LastLoginDate: new Date() },
            { where: { ID: user.ID } }
        );

        // Redirect to intended page or dashboard
       return res.json({
            status: true,
            user: user,
            token: token, // Include token in response if needed
            message: 'Login successful'
        });

        // If you want to redirect instead of returning JSON, uncomment below:
        // res.redirect(req.session.redirectTo || '/dashboard');
        // delete req.session.redirectTo; // Clear after use

    } catch (error) {
        console.error('Login error:', error);
        res.json({
            status: false,
            errors: { general: 'An error occurred during login. Please try again.' },
            userName: req.body.userName,
            message: null
        });
    }
});

// GET /auth/register - Show registration form
router.get('/register', (req, res) => {
    if (req.session.user) {
        return res.redirect('/dashboard');
    }
    
    res.render('auth/register', {
        errors: {},
        user: {},
        message: null
    });
});

// POST /auth/register - Process registration
router.post('/register', [
    body('userName')
        .isLength({ min: 3 })
        .withMessage('Username must be at least 3 characters long')
        .trim(),
    body('password')
        .isLength({ min: 6 })
        .withMessage('Password must be at least 6 characters long'),
    body('confirmPassword')
        .custom((value, { req }) => {
            if (value !== req.body.password) {
                throw new Error('Passwords do not match');
            }
            return true;
        }),
    body('employeeID')
        .optional()
        .isNumeric()
        .withMessage('Employee ID must be a number')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        const { userName, password, employeeID,userAccessArray } = req.body;

        let validationErrors = {};
        
        if (!errors.isEmpty()) {
            errors.array().forEach(error => {
                validationErrors[error.param] = error.msg;
            });
        }

        // Check if username already exists
        const existingUser = await Users.findOne({
            where: { UserName: userName }
        });

        if (existingUser) {
            validationErrors.userName = 'Username already exists';
        }

        if (Object.keys(validationErrors).length > 0) {
            return res.json( {
                errors: validationErrors,
                user: req.body,
                message: null
            });
        }

        // Hash password
        const hashedPassword = await hashPassword(password);

        // Create new user
        const newUser = await Users.create({
            EmployeeID: employeeID || 0,
            UserName: userName,
            Password: hashedPassword,
            userAccessArray: userAccessArray || [], // Assuming userAccessArray is an array of access levels
            UserAccessID: 1, // Default user access level
            Active: true,
            CreatedBy: 'System',
            CreatedDate: new Date()
        });
        let parseArray;
        try{
            parseArray=JSON.parse(userAccessArray)
        }catch{
            parseArray=userAccessArray
        }
        for(let i=0;i<parseArray.length;i++){
            console.log("userAccessArray=====>",parseArray[i])
            await db.UserUserAccess.create({
                UserID:newUser.ID,
                UserAccessID:parseArray[i]
            })
        }
        res.json({status:true});

    } catch (error) {
        console.error('Registration error:', error);
        res.json( {
            errors: { general: 'An error occurred during registration. Please try again.' },
            user: req.body,
            message: null
        });
    }
});

// GET /auth/logout - Logout user
router.get('/logout', (req, res) => {
    // Clear session
    req.session.destroy((err) => {
        if (err) {
            console.error('Session destroy error:', err);
        }
        
        // Clear JWT cookie
        res.clearCookie('authToken');
        
        // Redirect to login
        res.redirect('/auth/login?message=You have been logged out successfully');
    });
});

// GET /auth/profile - User profile
router.get('/profile', requireAuth, async (req, res) => {
    try {
        // console.log("req.token",)
        const user = await Users.findByPk(req.user.id, {
            include: [{
                model: UserAccess,
                as: 'userAccess',
                // attributes: ['Description']
            }]
        });

        if (!user) {
            return res.redirect('/auth/login');
        }

        res.json( {
            user: {
                ...user.toJSON(),
                userAccessArray: user.userAccessArray ? JSON.parse(user.userAccessArray) : [],
                userAccess: user.userAccess ? user.userAccess.Description : null
            },
            username: req.user.username
        });
    } catch (error) {
        console.error('Profile error:', error);
        res.status(500).render('error', { error });
    }
});

// POST /auth/change-password - Change password
router.post('/change-password', [
    requireAuth,
    body('currentPassword')
        .notEmpty()
        .withMessage('Current password is required'),
    body('newPassword')
        .isLength({ min: 6 })
        .withMessage('New password must be at least 6 characters long'),
    body('confirmNewPassword')
        .custom((value, { req }) => {
            if (value !== req.body.newPassword) {
                throw new Error('New passwords do not match');
            }
            return true;
        })
], async (req, res) => {
    try {
        const errors = validationResult(req);
        const { currentPassword, newPassword } = req.body;

        if (!errors.isEmpty()) {
            const validationErrors = {};
            errors.array().forEach(error => {
                validationErrors[error.param] = error.msg;
            });

            return res.json( {
                errors: validationErrors,
                username: req.user.username
            });
        }

        // Get current user
        const user = await Users.findByPk(req.user.id);
        if (!user) {
            return res.json({
                status:false,
                message:"user not found"
            })
        }

        // Verify current password
        const isValidPassword = await verifyPassword(currentPassword, user.Password);
        if (!isValidPassword) {
            return res.json( {
                errors: { currentPassword: 'Current password is incorrect' },
                username: req.user.username
            });
        }

        // Hash new password
        const hashedNewPassword = await hashPassword(newPassword);

        // Update password
        await Users.update(
            { Password: hashedNewPassword },
            { where: { ID: user.ID } }
        );

        res.json( {
            errors: {},
            success: 'Password changed successfully',
            username: req.user.username
        });

    } catch (error) {
        console.error('Change password error:', error);
        res.json({
            errors: { general: 'An error occurred. Please try again.' },
            username: req.user.username
        });
    }
});

// Middleware to require authentication
function requireAuthOld(req, res, next) {
    // Check session first
    if (req.session && req.session.isAuthenticated && req.session.user) {
        return next();
    }

    // Check JWT token if session is not available
    const token = req.cookies.authToken;
    if (token) {
        const decoded = verifyToken(token);
        if (decoded) {
            // Restore session from JWT
            req.session.user = {
                id: decoded.id,
                userName: decoded.userName,
                userAccessID: decoded.userAccessID,
                employeeID: decoded.employeeID
            };
            req.session.username = decoded.userName;
            req.session.isAuthenticated = true;
            return next();
        }
    }

    // Store intended URL for redirect after login
    req.session.redirectTo = req.originalUrl;
    res.redirect('/auth/login');
}

// Middleware to require specific user access level
function requireRole(minAccessLevel) {
    return async (req, res, next) => {
        if (!req.session.user) {
            return res.redirect('/auth/login');
        }

        try {
            const userAccess = await UserAccess.findByPk(req.session.user.userAccessID);
            if (!userAccess || userAccess.Level < minAccessLevel) {
                return res.status(403).render('error', {
                    error: { message: 'Access denied. Insufficient permissions.' }
                });
            }
            next();
        } catch (error) {
            console.error('Role check error:', error);
            res.status(500).render('error', { error });
        }
    };
}

// Middleware to check if user is already authenticated (for login/register pages)
function redirectIfAuthenticated(req, res, next) {
    if (req.session && req.session.isAuthenticated) {
        return res.redirect('/dashboard');
    }
    next();
}

// module.exports = {
//     router,
//     requireAuth,
//     requireRole,
//     redirectIfAuthenticated,
//     hashPassword,
//     verifyPassword
// };
module.exports = router;