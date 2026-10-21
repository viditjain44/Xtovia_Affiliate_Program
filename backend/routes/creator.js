const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Affiliate = require("../models/Affiliate");
const Click = require("../models/Click");
const Commission = require("../models/Commission");
const Payout = require("../models/Payout");
const { requireAuth } = require("../middleware/auth");
const { round2 } = require("../services/commissionCalculator");

router.use(requireAuth("creator"));

const { buildAffiliateLink } = require("../services/affiliateLink");

// GET /api/creator/me - profile, link and coupon
router.get("/me", async (req, res) => {
  try {
    const affiliate = await Affiliate.findById(req.user.id);
    if (!affiliate) return res.status(404).json({ message: "Account not found" });

    res.json({
      affiliate,
      trackingLink: buildAffiliateLink(affiliate),
    });
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
      .select("-customerEmail -flagReason -processedRefundIds") // keep customer data private
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
    const allowed = ["upiId", "accountHolderName", "accountNumber", "ifsc"];
    const update = {};
    allowed.forEach((key) => {
      if (req.body[key] !== undefined) update[`payoutDetails.${key}`] = req.body[key];
    });

    const affiliate = await Affiliate.findByIdAndUpdate(req.user.id, update, {
      new: true,
      runValidators: true,
    });
    res.json({ message: "Payout details saved", payoutDetails: affiliate.payoutDetails });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;