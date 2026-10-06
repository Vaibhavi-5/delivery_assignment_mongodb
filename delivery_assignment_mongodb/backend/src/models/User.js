const { Schema, model } = require("mongoose");

// One users collection, three roles (same idea as the Django version).
const userSchema = new Schema({
  username: { type: String, required: true, unique: true, trim: true },
  password_hash: { type: String, required: true },
  role: { type: String, enum: ["customer", "driver", "manager"], required: true },
  first_name: { type: String, default: "" },
  last_name: { type: String, default: "" },
});

userSchema.methods.fullName = function () {
  return `${this.first_name} ${this.last_name}`.trim();
};

module.exports = model("User", userSchema);
