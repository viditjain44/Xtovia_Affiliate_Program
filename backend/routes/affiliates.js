const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const Affiliate = require("../models/Affiliate");
const Click = require("../models/Click");
const Commission = require("../models/Commission");
const { requireAuth } = require("../middleware/auth");
const {
  createAffiliateDiscount,
  couponPercent,
  couponsEnabled,
} = require("../services/shopifyDiscounts");
const { buildAffiliateLink } = require("../services/affiliateLink");
const { round2 } = require("../services/commissionCalculator");

router.use(requireAuth("admin"));

// Turns "priya.sharma_" into "PRIYASHARMA", and adds a number if already taken
async function generateRefCode(instagramUsername) {
  const base =
    instagramUsername.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 12) ||
    "XTOVIA";

  let code = base;
  let n = 1;
  while (await Affiliate.exists({ refCode: code })) {
    n++;
    code = `${base}${n}`;
  }
  return code;
}

// Creates the creator's Shopify coupon and saves it on the affiliate
async function addCoupon(affiliate) {
  if (!couponsEnabled()) {
    throw new Error("Coupons are turned off (COUPON_DISCOUNT_PERCENT=0)");
  }
  const percent = couponPercent();
  const code = `${affiliate.refCode}${percent}`; // e.g. PRIYASHARMA10

  const discountId = await createAffiliateDiscount({
    code,
    title: `Affiliate - ${affiliate.fullName} (${affiliate.refCode})`,
    percent,
  });

  affiliate.couponCode = code;
  affiliate.shopifyDiscountId = discountId;
  await affiliate.save();
  return code;
}

// POST /api/affiliates - create an affiliate (creator login included)
// Body: fullName, email, instagramUsername, password, commissionRate?, createCoupon?
router.post("/", async (req, res) => {
  try {
    const { fullName, email, instagramUsername, password, commissionRate, createCoupon } =
      req.body;

    if (!fullName || !email || !instagramUsername || !password) {
      return res.status(400).json({
        message: "fullName, email, instagramUsername and password are required.",
      });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters." });
    }

    const refCode = await generateRefCode(instagramUsername);

    const affiliate = await Affiliate.create({
      fullName,
      email,
      instagramUsername,
      refCode,
      passwordHash: await bcrypt.hash(password, 10),
      ...(commissionRate !== undefined && { commissionRate }),
    });

    // Optional: create their Shopify coupon right away
    let couponError = null;
    if (createCoupon) {
      try {
        await addCoupon(affiliate);
      } catch (err) {
        couponError = err.message;
      }
    }

    const result = affiliate.toObject();
    delete result.passwordHash;

    res.status(201).json({
      message: "Affiliate created",
      affiliate: result,
      trackingLink: buildAffiliateLink(affiliate),
      ...(couponError && { couponError }),
    });
  } catch (err) {
    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern || {})[0] || "field";
      return res.status(409).json({ message: `An affiliate with this ${field} already exists.` });
    }
    if (err.name === "ValidationError") {
      return res.status(400).json({ message: err.message });
    }
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET /api/affiliates - list all affiliates
router.get("/", async (req, res) => {
  try {
    const affiliates = await Affiliate.find().sort({ createdAt: -1 });
    res.json(affiliates);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET /api/affiliates/report - totals + one row per affiliate link
// "Successful" affiliate = at least one order that wasn't cancelled / fully refunded
router.get("/report", async (req, res) => {
  try {
    const [affiliates, orderStats, clickStats, returningStats] = await Promise.all([
      Affiliate.find()
        .select("fullName email refCode couponCode status createdAt")
        .sort({ createdAt: -1 })
        .lean(),
      Commission.aggregate([
        { $match: { status: { $ne: "REVERSED" } } },
        {
          $group: {
            _id: "$affiliateId",
            orders: { $sum: 1 },
            sales: { $sum: { $subtract: ["$orderBase", "$refundedBase"] } },
            commission: { $sum: "$amount" },
            lastOrderAt: { $max: "$createdAt" },
          },
        },
      ]),
      Click.aggregate([{ $group: { _id: "$affiliateId", clicks: { $sum: 1 } } }]),
      // Orders from customers who had bought before - recorded, but no commission
      Commission.aggregate([
        { $match: { isNewCustomer: false } },
        { $group: { _id: "$affiliateId", count: { $sum: 1 } } },
      ]),
    ]);

    const ordersById = new Map(orderStats.map((s) => [String(s._id), s]));
    const clicksById = new Map(clickStats.map((s) => [String(s._id), s.clicks]));
    const returningById = new Map(returningStats.map((s) => [String(s._id), s.count]));

    const rows = affiliates.map((a) => {
      const o = ordersById.get(String(a._id));
      const clicks = clicksById.get(String(a._id)) || 0;
      const orders = o ? o.orders : 0;
      return {
        id: a._id,
        name: a.fullName,
        email: a.email,
        refCode: a.refCode,
        link: buildAffiliateLink(a),
        status: a.status,
        createdAt: a.createdAt,
        clicks,
        orders, // new-customer orders (the ones that earn commission)
        returningCustomerOrders: returningById.get(String(a._id)) || 0,
        conversionRate: clicks ? round2((orders / clicks) * 100) : 0, // %
        sales: round2(o ? o.sales : 0), // product revenue after discounts, excl. tax/shipping
        commission: round2(o ? o.commission : 0),
        lastOrderAt: o ? o.lastOrderAt : null,
      };
    });

    // Best performers first, then newest
    rows.sort((x, y) => y.orders - x.orders || y.sales - x.sales);

    res.json({
      totals: {
        linksGenerated: rows.length,
        successfulAffiliates: rows.filter((r) => r.orders > 0).length,
        orders: rows.reduce((sum, r) => sum + r.orders, 0),
        returningCustomerOrders: rows.reduce((sum, r) => sum + r.returningCustomerOrders, 0),
        clicks: rows.reduce((sum, r) => sum + r.clicks, 0),
        sales: round2(rows.reduce((sum, r) => sum + r.sales, 0)),
        commission: round2(rows.reduce((sum, r) => sum + r.commission, 0)),
      },
      affiliates: rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// PATCH /api/affiliates/:id - update rate, status or details
router.patch("/:id", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid affiliate id" });
    }

    const allowed = ["fullName", "email", "commissionRate", "status"];
    const update = {};
    allowed.forEach((key) => {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    });

    const affiliate = await Affiliate.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true,
    });
    if (!affiliate) return res.status(404).json({ message: "Affiliate not found" });

    res.json(affiliate);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: "That email is already used." });
    }
    if (err.name === "ValidationError") {
      return res.status(400).json({ message: err.message });
    }
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/affiliates/:id/coupon - create their Shopify coupon
router.post("/:id/coupon", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid affiliate id" });
    }

    const affiliate = await Affiliate.findById(req.params.id);
    if (!affiliate) return res.status(404).json({ message: "Affiliate not found" });
    if (affiliate.couponCode) {
      return res
        .status(400)
        .json({ message: `This affiliate already has coupon ${affiliate.couponCode}` });
    }

    const code = await addCoupon(affiliate);
    res.json({ message: "Coupon created", couponCode: code });
  } catch (err) {
    console.error(err);
    res.status(502).json({ message: `Could not create coupon: ${err.message}` });
  }
});

// GET /api/affiliates/:refCode/stats - quick stats for one affiliate
router.get("/:refCode/stats", async (req, res) => {
  try {
    const affiliate = await Affiliate.findOne({ refCode: req.params.refCode.toUpperCase() });
    if (!affiliate) return res.status(404).json({ message: "Affiliate not found" });

    const [totalClicks, uniqueIps, orders] = await Promise.all([
      Click.countDocuments({ affiliateId: affiliate._id }),
      Click.distinct("ip", { affiliateId: affiliate._id }),
      Commission.countDocuments({ affiliateId: affiliate._id, status: { $ne: "REVERSED" } }),
    ]);

    res.json({
      refCode: affiliate.refCode,
      fullName: affiliate.fullName,
      totalClicks,
      uniqueClicks: uniqueIps.length,
      orders,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;