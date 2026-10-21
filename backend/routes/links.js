const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const Affiliate = require("../models/Affiliate");
const { createAffiliateDiscount } = require("../services/shopifyDiscounts");
const { buildAffiliateLink } = require("../services/affiliateLink");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Very small per-IP limit so nobody can spam Shopify with discount codes
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
async function ensureDiscount(affiliate) {
  if (affiliate.couponCode) return;

  const percent = Number(process.env.COUPON_DISCOUNT_PERCENT || 10);
  const discountId = await createAffiliateDiscount({
    code: affiliate.refCode,
    title: `Affiliate - ${affiliate.fullName} (${affiliate.refCode})`,
    percent,
  });

  affiliate.couponCode = affiliate.refCode;
  affiliate.shopifyDiscountId = discountId;
  await affiliate.save();
}

// POST /api/links/generate - public: body { name, email }
// Same email again returns the same link (and retries the discount if it failed before)
router.post("/generate", async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    const email = String(req.body?.email || "").trim().toLowerCase();

    if (!name || !EMAIL_RE.test(email)) {
      return res.status(400).json({ message: "Please enter your name and a valid email." });
    }
    if (rateLimited(req.ip)) {
      return res.status(429).json({ message: "Too many requests, please try again later." });
    }

    let affiliate = await Affiliate.findOne({ email });
    if (!affiliate) {
      affiliate = await Affiliate.create({
        fullName: name,
        email,
        refCode: await generateUniqueRefCode(name),
      });
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
      refCode: affiliate.refCode,
      link: buildAffiliateLink(affiliate),
      discountCode: affiliate.couponCode || null,
      discountPercent: Number(process.env.COUPON_DISCOUNT_PERCENT || 10),
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
