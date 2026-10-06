/**
 * Order assignment engine - the business rules of the project.
 *
 * Rule 1 - one order is never given to two drivers:
 *   MongoDB single-document updates are atomic, and every claim below is a
 *   "compare-and-set" (only change the row IF it is still available/pending).
 *   If two requests race, only one claim succeeds; the other sees nothing to
 *   update and backs off. (Works on a plain standalone MongoDB - no replica
 *   set / transactions required.)
 *
 * Rule 2 - orders from the same road/area go to ONE driver:
 *   Pending orders are grouped by road_area (oldest group first) and each
 *   whole group is handed to a single driver.
 *
 * Driver status: a driver becomes "busy" the moment they get a batch and
 *   goes back to "available" only when all their orders are delivered.
 *
 * Waiting queue: if no driver is available, orders simply stay "pending".
 *   They are retried whenever a driver frees up or a new order arrives.
 */
const Order = require("../models/Order");
const Driver = require("../models/Driver");

async function runAssignment() {
  const pending = await Order.find({ status: "pending" }).sort({ created_at: 1, order_no: 1 }).lean();
  if (!pending.length) return [];

  // Group by road_area; Map keeps insertion order => longest-waiting area first.
  const groups = new Map();
  for (const o of pending) {
    if (!groups.has(o.road_area)) groups.set(o.road_area, []);
    groups.get(o.road_area).push(o);
  }

  const assignments = [];

  for (const [, orders] of groups) {
    // Atomically claim ONE available driver (available -> busy).
    const driver = await Driver.findOneAndUpdate(
      { status: "available" }, { $set: { status: "busy" } },
      { sort: { _id: 1 }, new: true }
    ).populate("user", "username");
    if (!driver) break; // everyone is busy -> remaining groups stay pending (queued)

    const now = new Date();
    const ids = orders.map((o) => o.order_no);

    // Atomically take only orders that are STILL pending.
    const res = await Order.updateMany(
      { order_no: { $in: ids }, status: "pending" },
      { $set: { status: "assigned", driver: driver._id, assigned_at: now } }
    );

    if (res.modifiedCount === 0) {
      // Someone else grabbed this whole group first - give the driver back.
      await Driver.updateOne({ _id: driver._id }, { $set: { status: "available" } });
      continue;
    }

    const mine = await Order.find({ order_no: { $in: ids }, driver: driver._id, status: "assigned" })
      .select("order_no").sort({ order_no: 1 }).lean();
    assignments.push({ driver, orderIds: mine.map((o) => o.order_no) });
  }
  return assignments;
}

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function markOrderDelivered(orderNo, driverUser) {
  const order = await Order.findOne({ order_no: orderNo }).populate("driver");
  if (!order) throw new HttpError(404, "Order not found.");
  if (!order.driver || String(order.driver.user) !== String(driverUser._id)) {
    throw new HttpError(403, "This order is not assigned to you.");
  }
  if (order.status !== "assigned") {
    throw new HttpError(400, `Order is '${order.status}', not 'assigned' - cannot deliver.`);
  }

  // Atomic: only flips if it is still 'assigned' (protects against double-click / races).
  const done = await Order.findOneAndUpdate(
    { _id: order._id, status: "assigned" },
    { $set: { status: "delivered", delivered_at: new Date() } },
    { new: true }
  );
  if (!done) throw new HttpError(400, "Order is no longer 'assigned' - cannot deliver.");

  const stillOut = await Order.exists({ driver: order.driver._id, status: "assigned" });
  if (!stillOut) {
    await Driver.updateOne({ _id: order.driver._id }, { $set: { status: "available" } });
  }

  await runAssignment(); // driver freed -> pull the next queued batch
  return done;
}

module.exports = { runAssignment, markOrderDelivered, HttpError };
