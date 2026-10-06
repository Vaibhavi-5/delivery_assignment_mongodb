const express = require("express");
const Order = require("../models/Order");
const Customer = require("../models/Customer");
const { authenticate, requireRole, wrap } = require("../auth");
const { runAssignment } = require("../services/assignment");
const { populateOrder, orderCreated, orderCustomerView } = require("../serializers");

const router = express.Router();
router.use(authenticate, requireRole("customer"));

const getCustomer = (user) =>
  Customer.findOneAndUpdate({ user: user._id }, { $setOnInsert: { user: user._id } }, { upsert: true, new: true });

// A customer only ever sees their own orders.
router.get("/orders", wrap(async (req, res) => {
  const customer = await getCustomer(req.user);
  const orders = await populateOrder(Order.find({ customer: customer._id }).sort({ created_at: 1 }));
  res.json(orders.map(orderCustomerView));
}));

router.get("/orders/:id", wrap(async (req, res) => {
  const customer = await getCustomer(req.user);
  const o = await populateOrder(Order.findOne({ order_no: Number(req.params.id), customer: customer._id }));
  if (!o) return res.status(404).json({ detail: "Not found." });
  res.json(orderCustomerView(o));
}));

router.post("/orders", wrap(async (req, res) => {
  const road_area = String((req.body || {}).road_area || "").trim();
  const items_summary = String((req.body || {}).items_summary || "").trim();
  if (!road_area) return res.status(400).json({ road_area: ["This field may not be blank."] });
  if (items_summary.length > 500) return res.status(400).json({ items_summary: ["Ensure this field has no more than 500 characters."] });

  const customer = await getCustomer(req.user);
  const order = await Order.create({ customer: customer._id, road_area, items_summary });
  await runAssignment(); // new order -> try to place it with a free driver right away
  res.status(201).json(orderCreated(order));
}));

module.exports = router;
