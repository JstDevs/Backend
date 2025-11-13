const express = require('express');
const router = express.Router();
const db = require('../config/database');
const requireAuth = require('../middleware/requireAuth');

const DocumentApprovers = db.DocumentApprovers;

// 👉 GET all approvers (supports query params)
router.get('/', requireAuth, async (req, res) => {
  try {
    const departmentId = req.query.departmentId || req.query.DepartmentId;
    const subDepartmentId = req.query.subDepartmentId || req.query.SubDepartmentId;
    const level = req.query.level || req.query.Level;
    const active = req.query.active || req.query.Active;

    const where = {};
    if (departmentId) where.DepartmentId = departmentId;
    if (subDepartmentId) where.SubDepartmentId = subDepartmentId;
    if (level) where.SequenceLevel = level;
    if (active !== undefined) {
      where.Active = active === 'true' || active === true || active === '1' || active === 1;
    }

    const approvers = await DocumentApprovers.findAll({
      where: Object.keys(where).length > 0 ? where : {},
      order: [['DepartmentId', 'ASC'], ['SubDepartmentId', 'ASC'], ['SequenceLevel', 'ASC']]
    });

    return res.status(200).json({
      status: true,
      approvers
    });
  } catch (err) {
    console.error('Error fetching approvers:', err);
    res.status(500).json({ error: err.message });
  }
});

// 👉 GET approvers by Department and SubDepartment
router.get('/by-dept-subdept/:deptId/:subDeptId', requireAuth, async (req, res) => {
  try {
    const { deptId, subDeptId } = req.params;
    const approvers = await DocumentApprovers.findAll({
      where: {
        DepartmentId: deptId,
        SubDepartmentId: subDeptId,
        Active: true
      },
      order: [['SequenceLevel', 'ASC']]
    });

    return res.status(200).json({
      status: true,
      approvers
    });
  } catch (err) {
    console.error('Error fetching approvers by dept/subdept:', err);
    res.status(500).json({ error: err.message });
  }
});

// 👉 GET approvers by level
router.get('/by-level/:deptId/:subDeptId/:level', requireAuth, async (req, res) => {
  try {
    const { deptId, subDeptId, level } = req.params;
    const approvers = await DocumentApprovers.findAll({
      where: {
        DepartmentId: deptId,
        SubDepartmentId: subDeptId,
        SequenceLevel: level,
        Active: true
      }
    });

    return res.status(200).json({
      status: true,
      approvers
    });
  } catch (err) {
    console.error('Error fetching approvers by level:', err);
    res.status(500).json({ error: err.message });
  }
});

// 👉 GET single approver by ID
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const approver = await DocumentApprovers.findByPk(req.params.id);
    if (!approver) {
      return res.status(404).json({ message: 'Approver not found' });
    }

    return res.status(200).json({
      status: true,
      approver
    });
  } catch (err) {
    console.error('Error fetching approver:', err);
    res.status(500).json({ error: err.message });
  }
});

// 👉 CREATE new approver
router.post('/', requireAuth, async (req, res) => {
  try {
    const { DepartmentId, SubDepartmentId, ApproverID, SequenceLevel, Active } = req.body;
    const newApprover = await DocumentApprovers.create({
      DepartmentId,
      SubDepartmentId,
      ApproverID,
      SequenceLevel: SequenceLevel || 1,
      Active: Active !== undefined ? Active : true
    });

    return res.status(201).json({
      status: true,
      approver: newApprover
    });
  } catch (err) {
    console.error('Error creating approver:', err);
    res.status(400).json({ error: err.message });
  }
});

// 👉 UPDATE existing approver
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { DepartmentId, SubDepartmentId, ApproverID, SequenceLevel, Active } = req.body;
    const approver = await DocumentApprovers.findByPk(req.params.id);
    if (!approver) return res.status(404).json({ message: 'Approver not found' });

    const updateData = {};
    if (DepartmentId !== undefined) updateData.DepartmentId = DepartmentId;
    if (SubDepartmentId !== undefined) updateData.SubDepartmentId = SubDepartmentId;
    if (ApproverID !== undefined) updateData.ApproverID = ApproverID;
    if (SequenceLevel !== undefined) updateData.SequenceLevel = SequenceLevel;
    if (Active !== undefined) updateData.Active = Active;

    await approver.update(updateData);
    return res.status(200).json({
      status: true,
      approver
    });
  } catch (err) {
    console.error('Error updating approver:', err);
    res.status(400).json({ error: err.message });
  }
});

// 👉 DELETE an approver
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const approver = await DocumentApprovers.findByPk(req.params.id);
    if (!approver) return res.status(404).json({ message: 'Approver not found' });

    await approver.destroy();
    return res.status(200).json({
      status: true,
      approver
    });
  } catch (err) {
    console.error('Error deleting approver:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;



