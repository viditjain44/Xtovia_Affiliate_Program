const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Commission = require("../models/Commission");
const { requireAuth } = require("../middleware/auth");

router.use(requireAuth("admin"));

// GET /api/commissions?status=PENDING&affiliateId=...&flagged=true
router.get("/", async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status.toUpperCase();
    if (req.query.affiliateId && mongoose.isValidObjectId(req.query.affiliateId)) {
      filter.affiliateId = req.query.affiliateId;
    }
    if (req.query.flagged === "true") {
      filter.$or = [{ flagged: true }, { needsReview: true }];
    }

    const commissions = await Commission.find(filter)
      .populate("affiliateId", "fullName refCode instagramUsername")
      .sort({ createdAt: -1 })
      .limit(500);

    res.json(commissions);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// PATCH /api/commissions/:id/approve - approve now (also clears a flag)
router.patch("/:id/approve", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid commission id" });
    }

    const commission = await Commission.findOneAndUpdate(
      { _id: req.params.id, status: "PENDING" },
      { status: "APPROVED", approvedAt: new Date(), flagged: false },
      { new: true }
    );
    if (!commission) {
      return res.status(400).json({ message: "Only pending commissions can be approved." });
    }

    res.json(commission);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// PATCH /api/commissions/:id/reverse - cancel a commission (body: { reason })
router.patch("/:id/reverse", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid commission id" });
    }

    const commission = await Commission.findOneAndUpdate(
      { _id: req.params.id, status: { $in: ["PENDING", "APPROVED"] } },
      { status: "REVERSED", reversedReason: req.body.reason || "Reversed by admin" },
      { new: true }
    );
    if (!commission) {
      return res
        .status(400)
        .json({ message: "Only pending or approved commissions can be reversed." });
    }

    res.json(commission);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// PATCH /api/commissions/:id/resolve - clear "needs review" after you've handled it
router.patch("/:id/resolve", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid commission id" });
    }

    const commission = await Commission.findByIdAndUpdate(
      req.params.id,
      { needsReview: false },
      { new: true }
    );
    if (!commission) return res.status(404).json({ message: "Commission not found" });

    res.json(commission);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;