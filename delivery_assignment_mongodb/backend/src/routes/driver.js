const express = require("express");
const Order = require("../models/Order");
const Driver = require("../models/Driver");
const { authenticate, requireRole, wrap } = require("../auth");
const { markOrderDelivered, HttpError } = require("../services/assignment");
const { populateOrder, orderDriverView, driverView } = require("../serializers");

const router = express.Router();
router.use(authenticate, requireRole("driver"));

const getDriver = (user) =>
  Driver.findOneAndUpdate({ user: user._id }, { $setOnInsert: { user: user._id } }, { upsert: true, new: true });

router.get("/status", wrap(async (req, res) => {
  const driver = await getDriver(req.user);
  driver.user = req.user;
  res.json(driverView(driver));
}));

// Only orders assigned to this driver (?history=1 adds delivered ones).
router.get("/orders", wrap(async (req, res) => {
  const driver = await getDriver(req.user);
  const filter = { driver: driver._id };
  if (req.query.history !== "1") filter.status = "assigned";
  const orders = await populateOrder(Order.find(filter).sort({ created_at: 1 }));
  res.json(orders.map(orderDriverView));
}));

router.post("/orders/:id/deliver", wrap(async (req, res) => {
  const orderNo = Number(req.params.id);
  if (!Number.isInteger(orderNo)) return res.status(404).json({ detail: "Order not found." });
  try {
    const done = await markOrderDelivered(orderNo, req.user);
    const full = await populateOrder(Order.findById(done._id));
    res.json(orderDriverView(full));
  } catch (e) {
    if (e instanceof HttpError) return res.status(e.status).json({ detail: e.message });
    throw e;
  }
}));

module.exports = router;
