const mongoose = require("mongoose");
const { PORT, MONGODB_URI } = require("./config");
const { createApp } = require("./app");

async function main() {
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 8000 });

  console.log(
    "MongoDB connected:",
    mongoose.connection.host + "/" + mongoose.connection.name
  );

  createApp().listen(PORT, "0.0.0.0", () => {
    console.log(`Server running -> http://0.0.0.0:${PORT}/`);
  });
}

main().catch((e) => {
  console.error(
    "Could not start. Is MongoDB running / is MONGODB_URI correct?\n",
    e.message
  );
  process.exit(1);
});