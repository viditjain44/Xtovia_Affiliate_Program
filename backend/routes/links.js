const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const Affiliate = require("../models/Affiliate");
const {
  createAffiliateDiscount,
  couponPercent,
  couponsEnabled,
} = require("../services/shopifyDiscounts");
const { buildAffiliateLink } = require("../services/affiliateLink");

const { normalizeMobile } = require("../services/mobile");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Very small per-IP limit so nobody can spam sign-ups (and Shopify discount codes)
const RATE_LIMIT = 10; // requests
const RATE_WINDOW_MS = 60 * 60 * 1000; // per hour
const hits = new Map();

function rateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > RATE_LIMIT;
}

// Forget IPs that have been quiet for a full window, so the map doesn't grow forever
setInterval(() => {
  const now = Date.now();
  for (const [ip, times] of hits) {
    if (now - times[times.length - 1] >= RATE_WINDOW_MS) hits.delete(ip);
  }
}, RATE_WINDOW_MS).unref();

// "Priya Sharma" -> "PRIYASHARMA" + 4 random characters, e.g. "PRIYASHARMAK7Q2"
async function generateUniqueRefCode(name) {
  const base = name.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 10) || "XTOVIA";
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O or 1/I mix-ups

  for (let i = 0; i < 10; i++) {
    const suffix = Array.from({ length: 4 }, () => alphabet[crypto.randomInt(alphabet.length)]).join("");
    const code = `${base}${suffix}`;
    if (!(await Affiliate.exists({ $or: [{ refCode: code }, { couponCode: code }] }))) return code;
  }
  throw new Error("Could not generate a unique code, please try again");
}

// Creates the Shopify discount for this affiliate; the code is the same as their refCode
// (skipped in tracking-only mode)
async function ensureDiscount(affiliate) {
  if (!couponsEnabled() || affiliate.couponCode) return;

  const discountId = await createAffiliateDiscount({
    code: affiliate.refCode,
    title: `Affiliate - ${affiliate.fullName} (${affiliate.refCode})`,
    percent: couponPercent(),
  });

  affiliate.couponCode = affiliate.refCode;
  affiliate.shopifyDiscountId = discountId;
  await affiliate.save();
}

// POST /api/links/generate - public: body { name, email, mobile }
// Same email again returns the same link (and retries the discount if it failed before)
router.post("/generate", async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    const email = String(req.body?.email || "").trim().toLowerCase();
    const mobile = normalizeMobile(req.body?.mobile);

    if (!name || !EMAIL_RE.test(email)) {
      return res.status(400).json({ message: "Please enter your name and a valid email." });
    }
    if (!mobile) {
      return res.status(400).json({ message: "Please enter a valid 10-digit mobile number." });
    }
    if (rateLimited(req.ip)) {
      return res.status(429).json({ message: "Too many requests, please try again later." });
    }

    let affiliate = await Affiliate.findOne({ email });
    if (!affiliate) {
      affiliate = await Affiliate.create({
        fullName: name,
        email,
        mobile,
        refCode: await generateUniqueRefCode(name),
      });
    } else if (!affiliate.mobile) {
      // Affiliates from before mobile was asked for get it filled in now
      affiliate.mobile = mobile;
      await affiliate.save();
    }

    let discountError = null;
    try {
      await ensureDiscount(affiliate);
    } catch (err) {
      console.error("[links/generate] discount:", err.message);
      discountError = "Your link works, but the customer discount could not be created yet.";
    }

    res.json({
      name: affiliate.fullName,
      email: affiliate.email,
      mobile: affiliate.mobile,
      refCode: affiliate.refCode,
      link: buildAffiliateLink(affiliate),
      discountCode: couponsEnabled() ? affiliate.couponCode || null : null,
      discountPercent: couponPercent(),
      ...(discountError && { discountError }),
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: "Please try again." });
    }
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
