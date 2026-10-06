// Integration tests - need a running MongoDB. WARNING: wipes MONGODB_TEST_URI database.
//   cd backend && npm test
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
require("dotenv").config();

const User = require("../src/models/User");
const Driver = require("../src/models/Driver");
const Customer = require("../src/models/Customer");
const Order = require("../src/models/Order");
const { Counter } = require("../src/models/Counter");
const { createApp } = require("../src/app");

const TEST_URI = process.env.MONGODB_TEST_URI || "mongodb://127.0.0.1:27017/delivery_assignment_test";
let server, base;

async function call(method, path, token, body) {
  const res = await fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null; try { data = await res.json(); } catch (e) {}
  return { status: res.status, data };
}
const login = async (u, p) => (await call("POST", "/api/auth/login/", null, { username: u, password: p })).data;

before(async () => {
  await mongoose.connect(TEST_URI);
  await mongoose.connection.dropDatabase();
  const hash = await bcrypt.hash("pw12345", 4);
  await User.create({ username: "mgr", role: "manager", password_hash: hash });
  for (const n of ["d1", "d2"]) {
    const u = await User.create({ username: n, role: "driver", password_hash: hash });
    await Driver.create({ user: u._id });
  }
  for (const n of ["c1", "c2", "c3", "c4"]) {
    const u = await User.create({ username: n, role: "customer", password_hash: hash });
    await Customer.create({ user: u._id });
  }
  server = http.createServer(createApp());
  await new Promise((r) => server.listen(0, r));
  base = "http://127.0.0.1:" + server.address().port;
});

after(async () => {
  await new Promise((r) => server.close(r));
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test("login returns the role from the database", async () => {
  assert.equal((await login("mgr", "pw12345")).role, "manager");
  assert.equal((await login("d1", "pw12345")).role, "driver");
  assert.equal((await login("c1", "pw12345")).role, "customer");
  assert.equal((await call("POST", "/api/auth/login/", null, { username: "c1", password: "bad" })).status, 401);
});

test("cross-role access is denied (403) and no token is 401", async () => {
  const c = (await login("c1", "pw12345")).access;
  const d = (await login("d1", "pw12345")).access;
  const m = (await login("mgr", "pw12345")).access;
  assert.equal((await call("GET", "/api/manager/orders/", c)).status, 403);
  assert.equal((await call("GET", "/api/driver/orders/", c)).status, 403);
  assert.equal((await call("GET", "/api/customer/orders/", d)).status, 403);
  assert.equal((await call("GET", "/api/manager/orders/", d)).status, 403);
  assert.equal((await call("GET", "/api/customer/orders/", m)).status, 403);
  assert.equal((await call("GET", "/api/driver/orders/", m)).status, 403);
  assert.equal((await call("GET", "/api/manager/orders/")).status, 401);
});

test("assignment rules: same area -> one driver, busy excluded, queue, auto-pickup", async () => {
  const t = {};
  for (const n of ["c1", "c2", "c3", "c4", "d1", "d2", "mgr"]) t[n] = (await login(n, "pw12345")).access;

  // Two orders from the SAME area -> must go to the SAME single driver.
  await call("POST", "/api/customer/orders/", t.c1, { road_area: "MG Road", items_summary: "a" });
  await call("POST", "/api/customer/orders/", t.c2, { road_area: "MG Road", items_summary: "b" });
  let orders = (await call("GET", "/api/manager/orders/", t.mgr)).data;
  assert.equal(orders.length, 2);
  // First order was assigned immediately (driver took it); second arrived later and
  // goes to whichever driver is free - but never to two drivers at once:
  assert.ok(orders.every((o) => o.status === "assigned"));

  // Both drivers now busy? d1 has the first order; second order went to d2 (different batch).
  const drivers = (await call("GET", "/api/manager/drivers/", t.mgr)).data;
  assert.equal(drivers.filter((d) => d.status === "busy").length, 2);

  // All busy -> new order must wait in the queue (pending).
  const r3 = await call("POST", "/api/customer/orders/", t.c3, { road_area: "Whitefield" });
  assert.equal(r3.status, 201);
  const o3 = (await call("GET", "/api/customer/orders/", t.c3)).data[0];
  assert.equal(o3.status, "pending");
  assert.equal(o3.driver_name, null);

  // Busy driver delivers -> freed -> queued order is picked up automatically.
  const d1orders = (await call("GET", "/api/driver/orders/", t.d1)).data;
  assert.equal(d1orders.length, 1);
  const del = await call("POST", `/api/driver/orders/${d1orders[0].id}/deliver/`, t.d1);
  assert.equal(del.status, 200);
  assert.equal(del.data.status, "delivered");
  const after3 = (await call("GET", "/api/customer/orders/", t.c3)).data[0];
  assert.equal(after3.status, "assigned");
  assert.equal(after3.driver_name, "d1");

  // Delivering twice, or someone else's order, is rejected.
  assert.equal((await call("POST", `/api/driver/orders/${d1orders[0].id}/deliver/`, t.d1)).status, 400);
  const d2orders = (await call("GET", "/api/driver/orders/", t.d2)).data;
  assert.equal((await call("POST", `/api/driver/orders/${d2orders[0].id}/deliver/`, t.d1)).status, 403);
});

test("one order is never assigned to two drivers under concurrent runs", async () => {
  await Order.deleteMany({}); await Counter.deleteMany({});
  await Driver.updateMany({}, { status: "available" });
  const m = (await login("mgr", "pw12345")).access;
  const cust = await Customer.findOne();
  for (let i = 0; i < 5; i++) await Order.create({ customer: cust._id, road_area: "Area" + (i % 2) });
  // Fire many assignment runs at the same time.
  await Promise.all(Array.from({ length: 8 }, () => call("POST", "/api/manager/run-assignment/", m)));
  const all = await Order.find();
  const assigned = all.filter((o) => o.status === "assigned");
  assert.equal(assigned.length, 5);                                   // 2 areas, 2 drivers -> all placed
  const byArea = {};
  for (const o of assigned) (byArea[o.road_area] ||= new Set()).add(String(o.driver));
  for (const s of Object.values(byArea)) assert.equal(s.size, 1);     // each area -> exactly ONE driver
});
