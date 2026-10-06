const dns = require("dns");
dns.setServers(["8.8.8.8", "1.1.1.1"]);
require("dotenv").config();
const path = require("path");

module.exports = {
  PORT: Number(process.env.PORT) || 8000,
  MONGODB_URI: process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/delivery_assignment",
  JWT_SECRET: process.env.JWT_SECRET || "dev-secret-change-me",
  ACCESS_TTL: "8h",
  REFRESH_TTL: "7d",
  FRONTEND_DIR: path.resolve(__dirname, "..", "..", "frontend"),
};
