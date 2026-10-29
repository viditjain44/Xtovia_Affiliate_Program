const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Affiliate = require("../models/Affiliate");
const Click = require("../models/Click");
const Commission = require("../models/Commission");
const Payout = require("../models/Payout");
const { requireAuth } = require("../middleware/auth");
const { round2 } = require("../services/commissionCalculator");
const { buildAffiliateLink } = require("../services/affiliateLink");
const { normalizeMobile } = require("../services/mobile");

router.use(requireAuth("creator"));

// Only what the affiliate should see about themselves
function profileOf(affiliate) {
  return {
    fullName: affiliate.fullName,
    email: affiliate.email,
    mobile: affiliate.mobile || null,
    refCode: affiliate.refCode,
    commissionRate: affiliate.commissionRate,
    status: affiliate.status,
    payoutDetails: affiliate.payoutDetails || {},
    createdAt: affiliate.createdAt,
  };
}

// GET /api/creator/me - profile and link
router.get("/me", async (req, res) => {
  try {
    const affiliate = await Affiliate.findById(req.user.id);
    if (!affiliate) return res.status(404).json({ message: "Account not found" });

    res.json({
      affiliate: profileOf(affiliate),
      trackingLink: buildAffiliateLink(affiliate),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// PATCH /api/creator/me - body { fullName?, mobile? } (email is the login, so it can't change here)
router.patch("/me", async (req, res) => {
  try {
    const update = {};
    if (req.body.fullName !== undefined) {
      const fullName = String(req.body.fullName).trim();
      if (!fullName || fullName.length > 80) {
        return res.status(400).json({ message: "Please enter your name." });
      }
      update.fullName = fullName;
    }
    if (req.body.mobile !== undefined) {
      const mobile = normalizeMobile(req.body.mobile);
      if (!mobile) {
        return res.status(400).json({ message: "Please enter a valid 10-digit mobile number." });
      }
      update.mobile = mobile;
    }

    const affiliate = await Affiliate.findByIdAndUpdate(req.user.id, update, {
      returnDocument: "after",
      runValidators: true,
    });
    if (!affiliate) return res.status(404).json({ message: "Account not found" });
    res.json({ message: "Profile saved", affiliate: profileOf(affiliate) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET /api/creator/stats - numbers for the dashboard
router.get("/stats", async (req, res) => {
  try {
    const affiliateId = new mongoose.Types.ObjectId(req.user.id);

    const [totalClicks, uniqueIps, byStatus] = await Promise.all([
      Click.countDocuments({ affiliateId }),
      Click.distinct("ip", { affiliateId }),
      Commission.aggregate([
        { $match: { affiliateId } },
        { $group: { _id: "$status", count: { $sum: 1 }, amount: { $sum: "$amount" } } },
      ]),
    ]);

    const earnings = { pending: 0, approved: 0, paid: 0 };
    let orders = 0;

    byStatus.forEach((s) => {
      if (s._id === "REVERSED") return;
      earnings[s._id.toLowerCase()] = round2(s.amount);
      orders += s.count;
    });

    const uniqueClicks = uniqueIps.length;

    res.json({
      totalClicks,
      uniqueClicks,
      orders,
      conversionRate: uniqueClicks ? round2((orders / uniqueClicks) * 100) : 0, // %
      earnings,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET /api/creator/commissions - their orders and commissions
router.get("/commissions", async (req, res) => {
  try {
    const commissions = await Commission.find({ affiliateId: req.user.id })
      // keep customer data and internal review notes private
      .select("orderName orderBase refundedBase currency commissionRate amount status createdAt approvedAt paidAt")
      .sort({ createdAt: -1 })
      .limit(200);
    res.json(commissions);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET /api/creator/payouts - money they've been paid
router.get("/payouts", async (req, res) => {
  try {
    const payouts = await Payout.find({ affiliateId: req.user.id })
      .select("-commissionIds")
      .sort({ paidAt: -1 });
    res.json(payouts);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// PATCH /api/creator/payout-details - save UPI / bank details
router.patch("/payout-details", async (req, res) => {
  try {
    // Empty string clears a field
    const rules = {
      upiId: [/^[\w.\-]{2,256}@[a-zA-Z]{2,64}$/, "Please enter a valid UPI ID, e.g. name@okaxis."],
      accountHolderName: [/^.{2,80}$/, "Please enter the account holder's name."],
      accountNumber: [/^\d{9,18}$/, "Account number should be 9 to 18 digits."],
      ifsc: [/^[A-Z]{4}0[A-Z0-9]{6}$/, "Please enter a valid IFSC code, e.g. HDFC0001234."],
    };
    const update = {};
    for (const [key, [re, message]] of Object.entries(rules)) {
      if (req.body[key] === undefined) continue;
      let value = String(req.body[key]).trim();
      if (key === "ifsc") value = value.toUpperCase();
      if (key === "accountNumber") value = value.replace(/\s/g, "");
      if (value && !re.test(value)) return res.status(400).json({ message });
      update[`payoutDetails.${key}`] = value;
    }

    const affiliate = await Affiliate.findByIdAndUpdate(req.user.id, update, {
      returnDocument: "after",
      runValidators: true,
    });
    res.json({ message: "Payout details saved", payoutDetails: affiliate.payoutDetails });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;