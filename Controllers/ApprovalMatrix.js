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
      // documentID,
      // depID,
      subDepID,
      AllorMajority,
      NumberofApprover,
    } = req.body;

    const newRecord = await approvalmatrix.create({
      // documentID,
      // depID,
      subDepID,
      AllorMajority,
      NumberofApprover,
      Active: true,
      CreatedBy: req.user.id,
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

// Example Index (List)
router.get("/list", requireAuth, async (req, res) => {
  try {
    const list = await approvalmatrix.findAll();
    res.json({ list });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ✅ Hard Delete (Permanent remove)
router.delete("/delete/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const deletedCount = await approvalmatrix.destroy({
      where: { ID: id }
    });

    if (deletedCount === 0) {
      return res.status(404).json({
        message: "Approval Matrix record not found ❌"
      });
    }

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
