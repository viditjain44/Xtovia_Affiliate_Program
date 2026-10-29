const mongoose = require("mongoose");

// One row per "send me a code" request. Rows are kept for an hour so they can be
// counted for rate limiting, then MongoDB deletes them on its own.
const OtpSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    ip: { type: String, index: true },
    // null when the email isn't an affiliate - nothing is sent, but the request still counts
    affiliateId: { type: mongoose.Schema.Types.ObjectId, ref: "Affiliate", default: null },
    codeHash: { type: String, default: null }, // HMAC of the code, never the code itself
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    used: { type: Boolean, default: false },
  },
  { timestamps: true }
);

OtpSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 });

module.exports = mongoose.model("Otp", OtpSchema);
