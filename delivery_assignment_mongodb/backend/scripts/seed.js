/**
 * Seeds MongoDB: 1 restaurant, 20 drivers, 500 customers, 1 manager, 6 sample
 * pending orders.     npm run seed            (skip what already exists)
 *                     npm run seed:reset      (wipe everything first)
 */
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { MONGODB_URI } = require("../src/config");
const User = require("../src/models/User");
const Restaurant = require("../src/models/Restaurant");
const Driver = require("../src/models/Driver");
const Customer = require("../src/models/Customer");
const Order = require("../src/models/Order");
const { Counter } = require("../src/models/Counter");

const AREAS = [
  ["MG Road", "MG Road"], ["MG Road", "Brigade Road"],
  ["Koramangala", "80 Feet Road"], ["Koramangala", "Sony World Junction"],
  ["Indiranagar", "100 Feet Road"], ["Whitefield", "ITPL Main Road"],
  ["HSR Layout", "27th Main Road"], ["Jayanagar", "4th Block"],
];
const DRIVER_COUNT = 20, CUSTOMER_COUNT = 500;
const MANAGER = { username: "manager1", password: "Manager@123" };
const DRIVER_PASSWORD = "Driver@123", CUSTOMER_PASSWORD = "Customer@123"; // demo only

async function ensureUsers(defs, role, passwordHash) {
  const names = defs.map((d) => d.username);
  const existing = new Set((await User.find({ username: { $in: names } }).select("username")).map((u) => u.username));
  const fresh = defs.filter((d) => !existing.has(d.username))
    .map((d) => ({ ...d, role, password_hash: passwordHash }));
  if (fresh.length) await User.insertMany(fresh);
  return User.find({ username: { $in: names } }).sort({ username: 1 });
}

(async () => {
  await mongoose.connect(MONGODB_URI);
  if (process.argv.includes("--reset")) {
    console.log("Resetting existing data...");
    await Promise.all([Order, Driver, Customer, User, Restaurant, Counter].map((m) => m.deleteMany({})));
  }

  let restaurant = await Restaurant.findOne({ name: "Central Kitchen" });
  if (!restaurant) restaurant = await Restaurant.create({ name: "Central Kitchen", address: "1 Market Street, City Center" });
  console.log("Restaurant ready:", restaurant.name);

  // Hash each demo password ONCE and reuse (all demo accounts share it) -> seeding takes seconds.
  const [mgrHash, drvHash, custHash] = await Promise.all(
    [MANAGER.password, DRIVER_PASSWORD, CUSTOMER_PASSWORD].map((p) => bcrypt.hash(p, 10)));

  await ensureUsers([{ username: MANAGER.username, first_name: "Store", last_name: "Manager" }], "manager", mgrHash);
  console.log(`Manager ready: ${MANAGER.username} / ${MANAGER.password}`);

  const pad = (n, w) => String(n).padStart(w, "0");
  const driverUsers = await ensureUsers(
    Array.from({ length: DRIVER_COUNT }, (_, i) => ({ username: `driver${pad(i + 1, 2)}`, first_name: `Driver${pad(i + 1, 2)}` })),
    "driver", drvHash);
  const haveDrv = new Set((await Driver.find({ user: { $in: driverUsers.map((u) => u._id) } })).map((d) => String(d.user)));
  const newDrv = driverUsers.filter((u) => !haveDrv.has(String(u._id))).map((u) => ({ user: u._id, restaurant: restaurant._id }));
  if (newDrv.length) await Driver.insertMany(newDrv);
  console.log(`${driverUsers.length} drivers ready (driver01..driver${pad(DRIVER_COUNT, 2)} / ${DRIVER_PASSWORD})`);

  const custUsers = await ensureUsers(
    Array.from({ length: CUSTOMER_COUNT }, (_, i) => ({ username: `customer${pad(i + 1, 3)}`, first_name: `Customer${pad(i + 1, 3)}` })),
    "customer", custHash);
  const haveCust = new Set((await Customer.find({ user: { $in: custUsers.map((u) => u._id) } })).map((c) => String(c.user)));
  const newCust = custUsers.filter((u) => !haveCust.has(String(u._id))).map((u, i) => {
    const [area, road] = AREAS[i % AREAS.length];
    return { user: u._id, default_road_area: `${area}, ${road}` };
  });
  if (newCust.length) await Customer.insertMany(newCust);
  console.log(`${custUsers.length} customers ready (customer001..customer${pad(CUSTOMER_COUNT, 3)} / ${CUSTOMER_PASSWORD})`);

  if (!(await Order.exists({}))) {
    const customers = await Customer.find().sort({ _id: 1 }).limit(6);
    for (let i = 0; i < customers.length; i++) {
      const [area, road] = AREAS[i % AREAS.length];
      await Order.create({ customer: customers[i]._id, road_area: `${area}, ${road}`, items_summary: `Sample order #${i + 1}` });
    }
    console.log(`${customers.length} sample orders created (status=pending)`);
  } else {
    console.log("Orders already exist - skipped sample orders.");
  }

  console.log(`\nSeed complete. Sign in with:\n  Manager : ${MANAGER.username} / ${MANAGER.password}\n  Driver  : driver01 / ${DRIVER_PASSWORD}\n  Customer: customer001 / ${CUSTOMER_PASSWORD}\n`);
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
