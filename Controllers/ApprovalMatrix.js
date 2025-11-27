const express = require("express");
const router = express.Router();
const db = require('../config/database'); 
const approvalmatrix = db.approvalmatrix;
const { Op } = require("sequelize");
const requireAuth = require("../middleware/requireAuth");

// ✅ Create (Insert new approvalmatrix record)
router.post("/create", requireAuth, async (req, res) => {
  try {
    const {
      DepartmentId: rawDepartmentId,
      departmentId: camelDepartmentId,
      SubDepartmentId: rawSubDepartmentId,
      subDepartmentId: camelSubDepartmentId,
      subDepID: rawSubDep,
      AllorMajority,
      NumberofApprover,
    } = req.body;

    const DepartmentIdRaw = rawDepartmentId ?? camelDepartmentId;
    const subDepIDRaw = rawSubDepartmentId ?? camelSubDepartmentId ?? rawSubDep;

    const DepartmentId = DepartmentIdRaw !== undefined && DepartmentIdRaw !== null
      ? parseInt(DepartmentIdRaw, 10)
      : undefined;
    const subDepID = subDepIDRaw !== undefined && subDepIDRaw !== null
      ? parseInt(subDepIDRaw, 10)
      : undefined;

    if (!DepartmentId || !subDepID) {
      console.error("❌ Missing required fields. Request body:", JSON.stringify(req.body, null, 2));
      return res.status(400).json({
        status: false,
        message: "DepartmentId and subDepID are required.",
        received: {
          DepartmentId: DepartmentIdRaw,
          subDepID: subDepIDRaw,
          body: req.body
        }
      });
    }

    let existing = null;
    try {
      existing = await approvalmatrix.findOne({
        where: {
          DepartmentId: DepartmentId,
          subDepID: subDepID,
          Active: true
        }
      });
    } catch (findErr) {
      console.warn("Warning: error checking existing approval matrix (possibly missing column). Continuing to create.", findErr.message);
    }

    if (existing) {
      return res.status(400).json({
      status: true,
      message: "Approval Matrix already exists for this Department/SubDepartment",
      data: existing
      });
    }

    const newRecord = await approvalmatrix.create({
      DepartmentId: DepartmentId,
      subDepID: subDepID,
      AllorMajority: AllorMajority || 'MAJORITY',
      NumberofApprover: NumberofApprover,
      Active: true,
      CreatedBy: req.user.id || req.user.userName,
      CreatedDate: new Date()
    });

    return res.status(201).json({
      message: "Approval Matrix record created successfully ✅",
      data: newRecord
    });
  } catch (err) {
    console.error("❌ Error creating approvalmatrix:", err);
    return res.status(500).json({
      message: "Failed to create approvalmatrix",
      error: err.message
    });
  }
});

// ✅ Get Approval Matrix (supports query params or full list)
router.get("/", requireAuth, async (req, res) => {
  try {
    const deptId = req.query.DepartmentId || req.query.departmentId;
    const subDeptId = req.query.SubDepartmentId || req.query.subDepartmentId;

    if (deptId && subDeptId) {
      const matrix = await approvalmatrix.findOne({
        where: {
          DepartmentId: deptId,
          subDepID: subDeptId,
          Active: true
        }
      });

      if (!matrix) {
        return res.json({
          status: false,
          message: "Approval Matrix not found for this Department/SubDepartment",
          data: null
        });
      }

      return res.json({
        status: true,
        data: matrix
      });
    }

    // If no query params, return full list (same as /list for backwards compatibility)
    const list = await approvalmatrix.findAll();
    return res.json({ status: true, data: list });
  } catch (err) {
    console.error("❌ Error fetching approvalmatrix:", err);
    return res.status(500).json({
      message: "Failed to fetch approvalmatrix",
      error: err.message
    });
  }
});

// Example Index (List) - kept for backwards compatibility
router.get("/list", requireAuth, async (req, res) => {
  try {
    const list = await approvalmatrix.findAll();
    res.json({ list });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ✅ Update Approval Matrix (by /update/:id)
router.put("/update/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      DepartmentId,
      subDepID,
      AllorMajority,
      NumberofApprover,
      Active
    } = req.body;

    const matrix = await approvalmatrix.findByPk(id);
    if (!matrix) {
      return res.status(404).json({
        message: "Approval Matrix record not found ❌"
      });
    }

    const updateData = {};
    if (DepartmentId !== undefined) updateData.DepartmentId = DepartmentId;
    if (subDepID !== undefined) updateData.subDepID = subDepID;
    if (AllorMajority !== undefined) updateData.AllorMajority = AllorMajority;
    if (NumberofApprover !== undefined) updateData.NumberofApprover = NumberofApprover;
    if (Active !== undefined) updateData.Active = Active;
    updateData.AlteredBy = req.user.id || req.user.userName;
    updateData.AlteredDate = new Date();

    await matrix.update(updateData);

    return res.json({
      message: "Approval Matrix updated successfully ✅",
      data: matrix
    });
  } catch (err) {
    console.error("❌ Error updating approvalmatrix:", err);
    return res.status(500).json({
      message: "Failed to update approvalmatrix",
      error: err.message
    });
  }
});

// ✅ Update Approval Matrix (by /:id) - for frontend compatibility
router.put("/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      DepartmentId,
      subDepID,
      subDepartmentId,
      AllorMajority,
      NumberofApprover,
      NumberOfApprover,
      Active
    } = req.body;

    const matrix = await approvalmatrix.findByPk(id);
    if (!matrix) {
      return res.status(404).json({
        status: false,
        message: "Approval Matrix record not found ❌"
      });
    }

    const updateData = {};
    if (DepartmentId !== undefined) updateData.DepartmentId = DepartmentId;
    if (subDepID !== undefined) updateData.subDepID = subDepID;
    if (subDepartmentId !== undefined) updateData.subDepID = subDepartmentId;
    if (AllorMajority !== undefined) updateData.AllorMajority = AllorMajority;
    if (NumberofApprover !== undefined) updateData.NumberofApprover = NumberofApprover;
    if (NumberOfApprover !== undefined) updateData.NumberofApprover = NumberOfApprover;
    if (Active !== undefined) updateData.Active = Active;
    updateData.AlteredBy = req.user.id || req.user.userName;
    updateData.AlteredDate = new Date();

    await matrix.update(updateData);

    return res.json({
      status: true,
      message: "Approval Matrix updated successfully ✅",
      data: matrix
    });
  } catch (err) {
    console.error("❌ Error updating approvalmatrix:", err);
    return res.status(500).json({
      status: false,
      message: "Failed to update approvalmatrix",
      error: err.message
    });
  }
});

// ✅ Get Approval Matrix by Department and SubDepartment
router.get("/by-dept-subdept/:deptId/:subDeptId", requireAuth, async (req, res) => {
  try {
    const { deptId, subDeptId } = req.params;

    const matrix = await approvalmatrix.findOne({
      where: {
        DepartmentId: deptId,
        subDepID: subDeptId,
        Active: true
      }
    });

    if (!matrix) {
      return res.status(404).json({
        message: "Approval Matrix not found for this Department/SubDepartment",
        data: null
      });
    }

    return res.json({
      status: true,
      data: matrix
    });
  } catch (err) {
    console.error("❌ Error fetching approvalmatrix:", err);
    return res.status(500).json({
      message: "Failed to fetch approvalmatrix",
      error: err.message
    });
  }
});

// ✅ Get Approval Matrix by ID
router.get("/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const matrix = await approvalmatrix.findByPk(id);

    if (!matrix) {
      return res.status(404).json({
        message: "Approval Matrix record not found ❌"
      });
    }

    return res.json({
      status: true,
      data: matrix
    });
  } catch (err) {
    console.error("❌ Error fetching approvalmatrix:", err);
    return res.status(500).json({
      message: "Failed to fetch approvalmatrix",
      error: err.message
    });
  }
});

// ✅ Soft Delete (Set Active = false)
router.delete("/delete/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const matrix = await approvalmatrix.findByPk(id);
    if (!matrix) {
      return res.status(404).json({
        message: "Approval Matrix record not found ❌"
      });
    }

    await matrix.update({
      Active: false,
      AlteredBy: req.user.id || req.user.userName,
      AlteredDate: new Date()
    });

    return res.json({
      message: "Approval Matrix record deleted successfully ✅"
    });
  } catch (err) {
    console.error("❌ Error deleting approvalmatrix:", err);
    return res.status(500).json({
      message: "Failed to delete approvalmatrix",
      error: err.message
    });
  }
});


module.exports = router;
