const jwt = require("jsonwebtoken");
const { JWT_SECRET, ACCESS_TTL, REFRESH_TTL } = require("./config");
const User = require("./models/User");

function signTokens(user) {
  const base = { sub: String(user._id), role: user.role };
  return {
    access: jwt.sign({ ...base, type: "access" }, JWT_SECRET, { expiresIn: ACCESS_TTL }),
    refresh: jwt.sign({ ...base, type: "refresh" }, JWT_SECRET, { expiresIn: REFRESH_TTL }),
  };
}

// Verifies the Bearer token AND re-loads the user from MongoDB, so the role
// in the database (not just the token) is always the source of truth.
async function authenticate(req, res, next) {
  const [scheme, token] = (req.headers.authorization || "").split(" ");
  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ detail: "Authentication credentials were not provided." });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.type !== "access") throw new Error("wrong token type");
    const user = await User.findById(payload.sub);
    if (!user) throw new Error("no such user");
    req.user = user;
    next();
  } catch (e) {
    res.status(401).json({ detail: "Given token not valid for any token type" });
  }
}

const requireRole = (role) => (req, res, next) =>
  req.user && req.user.role === role
    ? next()
    : res.status(403).json({ detail: "You do not have permission to perform this action." });

// Express 4 doesn't catch rejected promises on its own - wrap async handlers.
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { signTokens, authenticate, requireRole, wrap };
