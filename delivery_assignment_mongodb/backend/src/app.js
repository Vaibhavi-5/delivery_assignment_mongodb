const express = require("express");
const cors = require("cors");
const { FRONTEND_DIR } = require("./config");

function createApp() {
  const app = express();
  app.use(cors());              // dev-friendly; restrict to your frontend origin in production
  app.use(express.json());

  // Frontend served from the same server: http://127.0.0.1:8000/  ->  /app/login.html
  app.get("/", (req, res) => res.redirect("/app/login.html"));
  app.use("/app", express.static(FRONTEND_DIR));

  app.use("/api/auth", require("./routes/auth"));
  app.use("/api/customer", require("./routes/customer"));
  app.use("/api/driver", require("./routes/driver"));
  app.use("/api/manager", require("./routes/manager"));

  app.use("/api", (req, res) => res.status(404).json({ detail: "Not found." }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ detail: "Server error." });
  });
  return app;
}

module.exports = { createApp };
