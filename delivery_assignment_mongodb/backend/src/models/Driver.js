const { Schema, model } = require("mongoose");

const driverSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  status: { type: String, enum: ["available", "busy"], default: "available" },
  restaurant: { type: Schema.Types.ObjectId, ref: "Restaurant", default: null },
  phone: { type: String, default: "" },
});
driverSchema.index({ status: 1 });

module.exports = model("Driver", driverSchema);
