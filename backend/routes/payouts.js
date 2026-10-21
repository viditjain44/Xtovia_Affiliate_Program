const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Commission = require("../models/Commission");
const Payout = require("../models/Payout");
const Affiliate = require("../models/Affiliate");
const { requireAuth } = require("../middleware/auth");
const { round2 } = require("../services/commissionCalculator");

router.use(requireAuth("admin"));

// GET /api/payouts/due - how much each creator is owed (approved, not yet paid)
router.get("/due", async (req, res) => {
  try {
    const due = await Commission.aggregate([
      { $match: { status: "APPROVED" } },
      {
        $group: {
          _id: "$affiliateId",
          amount: { $sum: "$amount" },
          commissions: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: "affiliates",
          localField: "_id",
          foreignField: "_id",
          as: "affiliate",
        },
      },
      { $unwind: "$affiliate" },
      {
        $project: {
          _id: 0,
          affiliateId: "$_id",
          amount: 1,
          commissions: 1,
          fullName: "$affiliate.fullName",
          refCode: "$affiliate.refCode",
          payoutDetails: "$affiliate.payoutDetails",
        },
      },
      { $sort: { amount: -1 } },
    ]);

    res.json(due.map((d) => ({ ...d, amount: round2(d.amount) })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/payouts - record that you've paid a creator
// Body: affiliateId, method ("UPI" | "BANK" | "OTHER"), reference?, note?
// Marks ALL their approved commissions as paid
router.post("/", async (req, res) => {
  try {
    const { affiliateId, method, reference, note } = req.body;

    if (!mongoose.isValidObjectId(affiliateId)) {
      return res.status(400).json({ message: "Valid affiliateId is required." });
    }
    if (!["UPI", "BANK", "OTHER"].includes(method)) {
      return res.status(400).json({ message: "method must be UPI, BANK or OTHER." });
    }

    const affiliate = await Affiliate.findById(affiliateId);
    if (!affiliate) return res.status(404).json({ message: "Affiliate not found" });

    const commissions = await Commission.find({ affiliateId, status: "APPROVED" });
    if (!commissions.length) {
      return res.status(400).json({ message: "No approved commissions to pay." });
    }

    const amount = round2(commissions.reduce((sum, c) => sum + c.amount, 0));
    const commissionIds = commissions.map((c) => c._id);

    const payout = await Payout.create({
      affiliateId,
      amount,
      commissionIds,
      method,
      reference,
      note,
    });

    await Commission.updateMany(
      { _id: { $in: commissionIds }, status: "APPROVED" },
      { status: "PAID", paidAt: payout.paidAt, payoutId: payout._id }
    );

    res.status(201).json({ message: "Payout recorded", payout });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET /api/payouts?affiliateId=... - payout history
router.get("/", async (req, res) => {
  try {
    const filter = {};
    if (req.query.affiliateId && mongoose.isValidObjectId(req.query.affiliateId)) {
      filter.affiliateId = req.query.affiliateId;
    }

    const payouts = await Payout.find(filter)
      .populate("affiliateId", "fullName refCode")
      .sort({ paidAt: -1 })
      .limit(500);

    res.json(payouts);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;