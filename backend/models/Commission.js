const mongoose = require("mongoose");

// One commission per Shopify order
const CommissionSchema = new mongoose.Schema(
  {
    affiliateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Affiliate",
      required: true,
      index: true,
    },
    refCode: { type: String, required: true },

    // Order info
    shopifyOrderId: { type: String, required: true, unique: true }, // stops double-counting
    orderName: { type: String }, // e.g. "#1042"
    orderBase: { type: Number, required: true }, // amount commission is calculated on
    currency: { type: String, default: "INR" },
    taxesIncluded: { type: Boolean, default: false },
    customerEmail: { type: String, lowercase: true },
    source: { type: String, enum: ["LINK", "COUPON"], required: true },
    // Commission is only paid for a customer's first order on the store
    // (false = returning customer, recorded as REVERSED with 0 commission; null = couldn't check)
    isNewCustomer: { type: Boolean, default: null },

    // Commission
    commissionRate: { type: Number, required: true }, // rate at time of order
    amount: { type: Number, required: true },

    // Refunds
    refundedBase: { type: Number, default: 0 },
    processedRefundIds: [{ type: String }], // stops the same refund being counted twice

    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "PAID", "REVERSED"],
      default: "PENDING",
      index: true,
    },

    // Review flags
    flagged: { type: Boolean, default: false }, // e.g. self-referral
    needsReview: { type: Boolean, default: false }, // e.g. refunded after payout
    flagReason: { type: String },
    reversedReason: { type: String },

    approvedAt: { type: Date },
    paidAt: { type: Date },
    payoutId: { type: mongoose.Schema.Types.ObjectId, ref: "Payout" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Commission", CommissionSchema);