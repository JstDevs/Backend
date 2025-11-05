const express = require("express");
const router = express.Router();
// const { SubDepartment } = require("../models");
const db = require('../config/database'); 
const SubDepartment = db.SubDepartment
const { Op } = require("sequelize");

const requireAuth=require("../middleware/requireAuth")

// Route: Index (List)
router.get("/", requireAuth, async (req, res) => {
    console.log("req===>",req.user)
  const username = req.user.userName;
  // Only list active subdepartments and include parent department (if any)
  const list = await SubDepartment.findAll({
    where: { Active: 1 },
    include: [
      { model: db.Department, required: false }
    ]
  });
  res.json({ list, username });
});
// router.get("/", requireAuth, async (req, res) => {
//   console.log("req===>", req.user);
//   const username = req.user.userName;

//   const list = await SubDepartment.findAll({
//     include: [
//       {
//         model: db.Department,
//         required: true // ensures only SubDepartments with a Department are included
//       }
//     ]
//   });

//   res.json({ list, username });
// });


// Route: Create Form
router.get("/create", requireAuth, (req, res) => {
  const username = req.session.username;
  res.render("subDepartment/create", { username });
});

// Route: Handle Create
router.post("/create", requireAuth, async (req, res) => {
  const { Name, Code,DepartmentID } = req.body;
  const username = req.user.username;

  const nameExist = await SubDepartment.findOne({ where: { Name } });
  const codeExist = await SubDepartment.findOne({ where: { Code } });

  if (!Name || nameExist) {
    return res.json( { NameAlert: "Name already exists or is null" });
  }

  if (!Code || codeExist) {
    return res.json( { CodeAlert: "Code already exists or is null" });
  }

  await SubDepartment.create({
    Name,
    DepartmentID:DepartmentID,
    Code,
    CreatedBy: username,
    CreatedDate: new Date(),
    Active: true,
  });

  res.json({
    status:true
  });
});

// Route: Edit Form
router.get("/edit/:id", requireAuth, async (req, res) => {
  // Only allow editing active subdepartments
  const subDept = await SubDepartment.findOne({ where: { id: req.params.id, Active: 1 } });
  if (!subDept) return res.status(404).send("Not found");
  req.session.subDeptBackup = subDept; // Store original
  res.render("subDepartment/edit", { subDept });
});

// Route: Handle Edit
router.post("/edit/:id", requireAuth, async (req, res) => {
  const { Name, Code,DepartmentID } = req.body;
  const id = req.params.id;
  const username = req.user.userName;
 

  const nameExist = await SubDepartment.findOne({ where: { Name, id: { [Op.ne]: id } } });
  const codeExist = await SubDepartment.findOne({ where: { Code, id: { [Op.ne]: id } } });

  if (!Name || nameExist) {
    return res.json( { NameAlert: "Name already exists or is null", subDept: req.body });
  }

  if (!Code || codeExist) {
    return res.json( { CodeAlert: "Code already exists or is null", subDept: req.body });
  }

  await SubDepartment.update(
    {
      Name,
      Code,
      ModifyBy: username,
      DepartmentID:DepartmentID,
      ModifyDate: new Date(),
    },
    { where: { id } }
  );

  res.json({
    status:true
  });
});

// Route: Delete
router.get("/delete/:id", requireAuth, async (req, res) => {
  // Soft-delete: set Active = 0 instead of destroying the record
  await SubDepartment.update(
    { Active: 0 },
    { where: { id: req.params.id } }
  );

  res.json({ status: true });
});

// Route: Search
router.post("/search", requireAuth, async (req, res) => {
  const inputValue = req.body.inputValue;
  if (!inputValue) return res.redirect("/subdepartments");

  const nameMatches = await SubDepartment.findAll({
    where: { Active: 1, Name: { [Op.like]: `%${inputValue}%` } },
  });

  const codeMatches = await SubDepartment.findAll({
    where: { Active: 1, Code: { [Op.like]: `%${inputValue}%` } },
  });

  // Merge unique
  const allMatches = [...new Map([...nameMatches, ...codeMatches].map(item => [item.id, item])).values()];
  res.json({ list: allMatches });
});

module.exports = router;
