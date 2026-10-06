const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { JWT_SECRET } = require("../config");
const { signTokens, authenticate, wrap } = require("../auth");

const router = express.Router();

// ONE login endpoint for customer, driver and manager. Role comes from MongoDB.
router.post("/login", wrap(async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ detail: "username and password are required." });
  }
  const user = await User.findOne({ username: String(username).trim() });
  const ok = user && (await bcrypt.compare(String(password), user.password_hash));
  if (!ok) {
    return res.status(401).json({ detail: "No active account found with the given credentials" });
  }
  const t = signTokens(user);
  res.json({
    access: t.access, refresh: t.refresh, role: user.role,
    user_id: String(user._id), name: user.fullName() || user.username,
  });
}));

// Dashboards call this to verify the session and re-read the role from the DB.
router.get("/me", authenticate, (req, res) => {
  const u = req.user;
  res.json({ id: String(u._id), username: u.username, role: u.role, first_name: u.first_name, last_name: u.last_name });
});

router.post("/token/refresh", wrap(async (req, res) => {
  try {
    const p = jwt.verify((req.body || {}).refresh || "", JWT_SECRET);
    if (p.type !== "refresh") throw new Error("wrong type");
    const user = await User.findById(p.sub);
    if (!user) throw new Error("no user");
    res.json({ access: signTokens(user).access });
  } catch (e) {
    res.status(401).json({ detail: "Token is invalid or expired" });
  }
}));

module.exports = router;
