const express = require("express");
const router = express.Router();

const adminController = require("../controllers/adminController");
const { requireAdmin } = require("../middleware/auth");

router.get("/", requireAdmin, adminController.dashboard);
router.get("/analytics", requireAdmin, adminController.analytics);
router.get("/reports", requireAdmin, adminController.reports);
router.get("/reports/csv", requireAdmin, adminController.reportsCsv);
router.get("/create", requireAdmin, adminController.showCreateCustomer);
router.post("/create", requireAdmin, adminController.createCustomer);
router.post("/approve/:id", requireAdmin, adminController.approveUser);
router.post("/reject/:id", requireAdmin, adminController.rejectUser);

module.exports = router;
