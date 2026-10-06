const { Schema, model } = require("mongoose");

const restaurantSchema = new Schema({
  name: { type: String, required: true },
  address: { type: String, required: true },
  is_active: { type: Boolean, default: true },
});

module.exports = model("Restaurant", restaurantSchema);
