const { Schema, model } = require("mongoose");
const { nextSeq } = require("./Counter");

const orderSchema = new Schema({
  order_no: { type: Number, unique: true },               // shown to users as "#12"
  customer: { type: Schema.Types.ObjectId, ref: "Customer", required: true },
  road_area: { type: String, required: true, trim: true },
  items_summary: { type: String, default: "", maxlength: 500 },
  // pending = waiting for a driver. This status IS the waiting queue.
  status: { type: String, enum: ["pending", "assigned", "delivered", "cancelled"], default: "pending" },
  driver: { type: Schema.Types.ObjectId, ref: "Driver", default: null },
  created_at: { type: Date, default: Date.now },
  assigned_at: { type: Date, default: null },
  delivered_at: { type: Date, default: null },
});
orderSchema.index({ status: 1, created_at: 1 });
orderSchema.index({ driver: 1, status: 1 });
orderSchema.index({ customer: 1 });

orderSchema.pre("validate", async function (next) {
  try {
    if (this.isNew && this.order_no == null) this.order_no = await nextSeq("order");
    next();
  } catch (e) { next(e); }
});

module.exports = model("Order", orderSchema);
