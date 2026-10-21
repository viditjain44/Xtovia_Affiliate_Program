const mongoose = require("mongoose");

const ClickSchema = new mongoose.Schema(
  {
    affiliateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Affiliate",
      required: true,
      index: true,
    },
    refCode: { type: String, required: true },
    ip: { type: String },
    userAgent: { type: String },
    referrer: { type: String }, // e.g. instagram.com
    landingPath: { type: String }, // which store page they were sent to
  },
  { timestamps: true }
);

module.exports = mongoose.model("Click", ClickSchema);