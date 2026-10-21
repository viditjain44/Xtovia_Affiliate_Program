const mongoose = require("mongoose");

// A record of money actually sent to a creator
const PayoutSchema = new mongoose.Schema(
  {
    affiliateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Affiliate",
      required: true,
      index: true,
    },
    amount: { type: Number, required: true },
    commissionIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Commission" }],
    method: { type: String, enum: ["UPI", "BANK", "OTHER"], required: true },
    reference: { type: String, trim: true }, // UPI transaction ID / UTR number
    note: { type: String, trim: true },
    paidAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Payout", PayoutSchema);