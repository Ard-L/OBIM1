const express = require("express");
const router = express.Router();
const customerController = require("../controllers/customerController");
const { requireCustomer } = require("../middleware/auth");

router.get("/", requireCustomer, customerController.customerDashboard);
router.post("/deposit", requireCustomer, customerController.deposit);
router.post("/withdraw", requireCustomer, customerController.withdraw);

router.get("/bills", requireCustomer, customerController.showBills);
router.post("/bills/pay", requireCustomer, customerController.payBill);

router.get("/transfer", requireCustomer, customerController.showTransfer);
router.post("/transfer", requireCustomer, customerController.transfer);

router.get("/profile", requireCustomer, customerController.showProfile);
router.post("/profile", requireCustomer, customerController.updateProfile);
router.post("/profile/password", requireCustomer, customerController.changePassword);

module.exports = router;
