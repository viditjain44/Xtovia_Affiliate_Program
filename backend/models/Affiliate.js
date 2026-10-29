const mongoose = require("mongoose");

// These fields will later be merged into the Creators Club "Creator" model
const AffiliateSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    // Indian mobile, saved as "+91XXXXXXXXXX" (affiliates created before this field have none)
    mobile: { type: String, trim: true },
    // Optional: people signing up from the public "generate link" page don't give this
    instagramUsername: { type: String, trim: true },

    // Login (never returned in queries unless asked for)
    passwordHash: { type: String, select: false },

    // Tracking
    refCode: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    couponCode: { type: String, uppercase: true, trim: true }, // set when coupon is created
    shopifyDiscountId: { type: String },

    // Commission
    commissionRate: { type: Number, default: 10, min: 0, max: 100 }, // percent

    // Where to send their money
    payoutDetails: {
      upiId: { type: String, trim: true },
      accountHolderName: { type: String, trim: true },
      accountNumber: { type: String, trim: true },
      ifsc: { type: String, trim: true, uppercase: true },
    },

    status: {
      type: String,
      enum: ["ACTIVE", "PAUSED"],
      default: "ACTIVE",
    },
    lastLoginAt: { type: Date },
  },
  { timestamps: true }
);

// Coupon codes must be unique, but only check affiliates that actually have one
AffiliateSchema.index(
  { couponCode: 1 },
  { unique: true, partialFilterExpression: { couponCode: { $type: "string" } } }
);
AffiliateSchema.index(
  { instagramUsername: 1 },
  { unique: true, partialFilterExpression: { instagramUsername: { $type: "string" } } }
);

module.exports = mongoose.model("Affiliate", AffiliateSchema);