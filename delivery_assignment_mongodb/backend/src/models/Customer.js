const { Schema, model } = require("mongoose");

const customerSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  default_road_area: { type: String, default: "" },
  phone: { type: String, default: "" },
});

module.exports = model("Customer", customerSchema);
