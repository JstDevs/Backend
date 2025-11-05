const express = require('express');
const router = express.Router();
const db = require('../config/database'); 
const Department = db.Department
const SubDepartment = db.SubDepartment
const { Op } = require('sequelize');
const requireAuth = require('../middleware/requireAuth'); // assuming you have this

// GET: Create Department Form
router.get('/create', requireAuth, (req, res) => {
  res.render('department/create', { username: req.session.username });
});

// POST: Create Department
router.post('/create', requireAuth, async (req, res) => {
  const { Name, Code } = req.body;
  console.log("req.user",req.user)
  const CreatedBy = req.user.userName;

  try {
    if (!Name) return res.json( { NameAlert: "Please Input a Name", Code });
    if (!Code) return res.josn( { CodeAlert: "Please Input a Code", Name });

    const nameExist = await Department.findOne({ where: { Name } });
    if (nameExist) return res.json( { NameAlert: "This Name already exists", Code });

    const codeExist = await Department.findOne({ where: { Code } });
    if (codeExist) return res.json( { CodeAlert: "This Code already exists", Name });

    await Department.create({
      Name,
      Code,
      CreatedBy,
      CreatedDate: new Date(),
      Active: true,
    });

    res.json({
        status:true
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

// GET: Edit Form
router.get('/edit/:id', requireAuth, async (req, res) => {
  // const department = await Department.findByPk(req.params.id);
  const department = await Department.findOne({ where: { Id: req.params.id, Active: 1 } });
  if (!department) return res.status(404).send("Department not found");

  req.session.editData = department; // Store for comparison
  res.render('department/edit', department);
});

// POST: Edit Department
router.post('/edit', requireAuth, async (req, res) => {
  const { Id, Name, Code } = req.body;
//   const { Name: oldName, Code: oldCode, Active, CreatedBy, CreatedDate } = req.session.editData;
  const ModifyBy = req.user.username;

  try {
    if (!Name) return res.json( { NameAlert: "Please Input a Name", Code });
    if (!Code) return res.json( { CodeAlert: "Please Input a Code", Name });

    // if (Name === oldName && Code === oldCode) {
    //   return res.json('department/edit', {
    //     CodeAlert: "You didn't change any of the data!",
    //     Name, Code
    //   });
    // }

    const nameExist = await Department.findOne({ where: { Name, Id: { [Op.ne]: Id } } });
    if (nameExist) return res.json( { NameAlert: "This Name already exists", Code });

    const codeExist = await Department.findOne({ where: { Code, Id: { [Op.ne]: Id } } });
    if (codeExist) return res.json( { CodeAlert: "This Code already exists", Name });

    await Department.update({
      Name,
      Code,
      
      
      ModifyBy,
      ModifyDate: new Date(),
    }, {
      where: { Id }
    });

    res.json({status:true});
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

// GET: Delete Department
// router.get('/delete/:id', requireAuth, async (req, res) => {
//   try {
//     await Department.destroy({ where: { Id: req.params.id } });
//     res.redirect('/department');
//   } catch (err) {
//     console.error(err);
//     res.status(500).send('Server Error');
//   }
// });
router.get('/delete/:id', requireAuth, async (req, res) => {
  const departmentId = req.params.id;

  try {
    // throw new Error("This is a test error");
    // Find all SubDepartments related to this Department
    // const subDepartments = await SubDepartment.findAll({
    //   where: { DepartmentID: departmentId }
    // });

    // Log them
    // console.error(`SubDepartments for Department ID ${departmentId}:`, subDepartments);
    
    // // Delete all related SubDepartments
    // await SubDepartment.destroy({
    //   where: { DepartmentID: departmentId }
    // });

    // // Delete the Department
    // await Department.destroy({
    //   where: { Id: departmentId }
    // });

    // Soft-delete: set Active = 0 for SubDepartments and Department inside a transaction
    await db.sequelize.transaction(async (t) => {
      await SubDepartment.update(
        { Active: 0 },
        { where: { DepartmentID: departmentId }, transaction: t }
      );

      await Department.update(
        { Active: 0 },
        { where: { Id: departmentId }, transaction: t }
      );
    });

    res.redirect('/department');
  } catch (err) {
    console.error(err);
    res.status(500).send(err.message || 'Server Error');
  }
});



// GET: List Departments
router.get('/', requireAuth, async (req, res) => {
  // Only list active departments and include only active subdepartments
  const list = await Department.findAll({
    where: { Active: 1 },
    include: [
      {
        model: db.SubDepartment,
        where: { Active: 1 },
        required: false // still return department if it has no active subdepartments
      }
    ]
  });
//   delete req.session.searchResults;
  res.json( { departments: list, username: req.user.username });
});

// POST: Search Department
router.post('/search', requireAuth, async (req, res) => {
  const { inputValue } = req.body;

  if (!inputValue) return res.json({
    status:"false"
  });

  const results = await Department.findAll({
    where: {
      [Op.and]: [
        { Active: 1 },
        {
          [Op.or]: [
            { Name: { [Op.like]: `%${inputValue}%` } },
            { Code: { [Op.like]: `%${inputValue}%` } }
          ]
        }
      ]
    }
  });

 res.json({
    status:true,
    results
 });
});

module.exports = router;
