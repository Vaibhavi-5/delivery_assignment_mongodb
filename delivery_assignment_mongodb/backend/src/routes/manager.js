const express = require("express");
const Order = require("../models/Order");
const Driver = require("../models/Driver");
const User = require("../models/User");
const Restaurant = require("../models/Restaurant");
const { authenticate, requireRole, wrap } = require("../auth");
const { runAssignment } = require("../services/assignment");
const { populateOrder, orderManagerView, driverView, restaurantView } = require("../serializers");

const router = express.Router();
router.use(authenticate, requireRole("manager"));

router.get("/orders", wrap(async (req, res) => {
  const orders = await populateOrder(Order.find().sort({ created_at: 1 }));
  res.json(orders.map(orderManagerView));
}));

router.get("/drivers", wrap(async (req, res) => {
  const drivers = await Driver.find().sort({ _id: 1 }).populate("user", "username first_name last_name");
  res.json(drivers.map(driverView));
}));

router.get("/restaurant", wrap(async (req, res) => {
  const r = await Restaurant.findOne({ is_active: true });
  res.json(r ? restaurantView(r) : {});
}));

router.get("/summary", wrap(async (req, res) => {
  const [total_drivers, total_customers, total_restaurants, available_drivers, busy_drivers] = await Promise.all([
    Driver.countDocuments(),
    User.countDocuments({ role: "customer" }),
    Restaurant.countDocuments({ is_active: true }),
    Driver.countDocuments({ status: "available" }),
    Driver.countDocuments({ status: "busy" }),
  ]);
  res.json({ total_drivers, total_customers, total_restaurants, available_drivers, busy_drivers });
}));

// Manual trigger (assignment also runs automatically on new order / delivery).
router.post("/run-assignment", wrap(async (req, res) => {
  const assignments = await runAssignment();
  res.json({ assigned: assignments.map((a) => ({ driver: a.driver.user.username, order_ids: a.orderIds })) });
}));

module.exports = router;
