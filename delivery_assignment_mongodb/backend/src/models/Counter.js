const { Schema, model } = require("mongoose");

// Tiny auto-increment helper so orders get friendly numbers (#1, #2, ...)
// instead of long MongoDB ObjectIds in the UI.
const counterSchema = new Schema({ _id: String, seq: { type: Number, default: 0 } });
const Counter = model("Counter", counterSchema);

async function nextSeq(name) {
  const c = await Counter.findOneAndUpdate(
    { _id: name }, { $inc: { seq: 1 } }, { upsert: true, new: true }
  );
  return c.seq;
}

module.exports = { Counter, nextSeq };
