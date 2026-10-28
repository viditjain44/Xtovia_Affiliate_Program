const express = require("express");
const router = express.Router();
const Affiliate = require("../models/Affiliate");
const Click = require("../models/Click");
const { couponsEnabled } = require("../services/shopifyDiscounts");

// GET /r/:refCode
// Optional: /r/:refCode?to=/products/some-product  (deep link to a product page)
router.get("/:refCode", async (req, res) => {
  const storeUrl = process.env.STORE_URL;

  try {
    const refCode = req.params.refCode.toUpperCase();

    // Build the destination URL - only allow pages on our own store
    let target = new URL(storeUrl);
    if (req.query.to) {
      const candidate = new URL(req.query.to, storeUrl);
      if (candidate.origin === target.origin) target = candidate;
    }

    const affiliate = await Affiliate.findOne({ refCode, status: "ACTIVE" });

    // Unknown or paused affiliate: still send the visitor to the store, just don't track
    if (!affiliate) {
      return res.redirect(target.toString());
    }

    await Click.create({
      affiliateId: affiliate._id,
      refCode,
      ip: req.ip,
      userAgent: req.get("user-agent"),
      referrer: req.get("referer"),
      landingPath: target.pathname,
    });

    target.searchParams.set("ref", refCode);

    // Shopify's /discount/CODE page saves the code in the visitor's session (it's applied
    // automatically at checkout) and then forwards them to the page in ?redirect=
    if (couponsEnabled() && affiliate.couponCode) {
      const discountUrl = new URL(`/discount/${encodeURIComponent(affiliate.couponCode)}`, storeUrl);
      discountUrl.searchParams.set("redirect", `${target.pathname}${target.search}`);
      return res.redirect(discountUrl.toString());
    }

    res.redirect(target.toString());
  } catch (err) {
    console.error(err);
    // Never leave the visitor on an error page
    res.redirect(storeUrl);
  }
});

module.exports = router;