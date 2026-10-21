const express = require("express");
const router = express.Router();
const cors = require("cors");
const Affiliate = require("../models/Affiliate");
const Click = require("../models/Click");

// Called from the store theme (shopify/affiliate-tracking.liquid), so allow the store's origin.
// The snippet sends text/plain so the browser doesn't need a CORS preflight request.
router.use(cors({ origin: (origin, done) => done(null, new URL(process.env.STORE_URL).origin) }));
router.use(express.text({ type: "text/plain", limit: "2kb" }));

// POST /api/track/click - body (JSON as text): { ref, path }
router.post("/click", async (req, res) => {
  try {
    let body = {};
    try {
      body = JSON.parse(req.body || "{}");
    } catch {
      return res.status(400).end();
    }

    const refCode = String(body.ref || "").toUpperCase().slice(0, 40);
    const affiliate = refCode && (await Affiliate.findOne({ refCode, status: "ACTIVE" }, "_id"));
    if (!affiliate) return res.status(204).end();

    await Click.create({
      affiliateId: affiliate._id,
      refCode,
      ip: req.ip,
      userAgent: req.get("user-agent"),
      referrer: String(body.referrer || "").slice(0, 500) || undefined,
      landingPath: String(body.path || "/").slice(0, 500),
    });
    res.status(204).end();
  } catch (err) {
    console.error("[track/click]", err);
    res.status(204).end(); // never bother the shopper with tracking errors
  }
});

module.exports = router;
