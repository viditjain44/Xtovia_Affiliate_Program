const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const Admin = require("../models/Admin");
const Affiliate = require("../models/Affiliate");
const Otp = require("../models/Otp");
const { requireAuth } = require("../middleware/auth");
const { sendLoginCode } = require("../services/brevo");

// Email OTP login for affiliates
const OTP_MINUTES = 10; // code is valid for
const OTP_MAX_ATTEMPTS = 5; // wrong tries before the code is cancelled
const OTP_COOLDOWN_MS = 60 * 1000; // between two codes to the same email
const OTP_PER_EMAIL_HOUR = 5;
const OTP_PER_IP_HOUR = 10;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Same answer whether or not the email is an affiliate, so nobody can find out who is
const OTP_SENT_MESSAGE = "If this email has an affiliate link, a 6-digit code has been sent to it.";

function hashCode(email, code) {
  return crypto.createHmac("sha256", process.env.JWT_SECRET).update(`${email}:${code}`).digest("hex");
}

function signToken(id, role) {
  return jwt.sign({ id: String(id), role }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
}

// POST /api/auth/admin/login
router.post("/admin/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required." });
    }

    const admin = await Admin.findOne({ email: email.toLowerCase() }).select("+passwordHash");
    if (!admin || !(await bcrypt.compare(password, admin.passwordHash))) {
      return res.status(401).json({ message: "Wrong email or password." });
    }

    res.json({
      token: signToken(admin._id, "admin"),
      admin: { id: admin._id, name: admin.name, email: admin.email },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/auth/creator/login
router.post("/creator/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required." });
    }

    const affiliate = await Affiliate.findOne({ email: email.toLowerCase() }).select(
      "+passwordHash"
    );
    if (
      !affiliate ||
      !affiliate.passwordHash ||
      !(await bcrypt.compare(password, affiliate.passwordHash))
    ) {
      return res.status(401).json({ message: "Wrong email or password." });
    }

    affiliate.lastLoginAt = new Date();
    await affiliate.save();

    res.json({
      token: signToken(affiliate._id, "creator"),
      creator: {
        id: affiliate._id,
        fullName: affiliate.fullName,
        email: affiliate.email,
        refCode: affiliate.refCode,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/auth/creator/otp/send - body { email }: emails a 6-digit login code
router.post("/creator/otp/send", async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ message: "Please enter a valid email." });
    }

    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
    if ((await Otp.countDocuments({ ip: req.ip, createdAt: { $gt: hourAgo } })) >= OTP_PER_IP_HOUR) {
      return res.status(429).json({ message: "Too many requests, please try again later." });
    }

    // Too soon / too many for this email: answer as usual but don't send another one
    const recent = await Otp.find({ email, createdAt: { $gt: hourAgo } })
      .sort({ createdAt: -1 })
      .select("createdAt")
      .lean();
    if (
      recent.length >= OTP_PER_EMAIL_HOUR ||
      (recent[0] && Date.now() - recent[0].createdAt.getTime() < OTP_COOLDOWN_MS)
    ) {
      return res.json({ message: OTP_SENT_MESSAGE });
    }

    const affiliate = await Affiliate.findOne({ email, status: "ACTIVE" });
    const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
    const expiresAt = new Date(Date.now() + OTP_MINUTES * 60 * 1000);

    if (!affiliate) {
      await Otp.create({ email, ip: req.ip, expiresAt, used: true }); // counted, nothing sent
      return res.json({ message: OTP_SENT_MESSAGE });
    }

    // A new code replaces any older one still waiting
    await Otp.updateMany({ email, used: false }, { used: true });
    const otp = await Otp.create({
      email,
      ip: req.ip,
      affiliateId: affiliate._id,
      codeHash: hashCode(email, code),
      expiresAt,
    });

    try {
      await sendLoginCode({ to: email, name: affiliate.fullName, code, minutes: OTP_MINUTES });
    } catch (err) {
      console.error("[otp/send]", err.message);
      await Otp.deleteOne({ _id: otp._id }); // don't count a code that never arrived
      return res.status(502).json({ message: "Could not send the code right now, please try again." });
    }

    res.json({ message: OTP_SENT_MESSAGE });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/auth/creator/otp/verify - body { email, code }: returns a login token
router.post("/creator/otp/verify", async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const code = String(req.body?.code || "").replace(/\D/g, "");
    const invalid = () =>
      res.status(400).json({ message: "Wrong or expired code. Please check it or request a new one." });
    if (!EMAIL_RE.test(email) || code.length !== 6) return invalid();

    // Count the attempt first, so parallel guesses can't get past the limit
    const otp = await Otp.findOneAndUpdate(
      {
        email,
        used: false,
        codeHash: { $ne: null },
        expiresAt: { $gt: new Date() },
        attempts: { $lt: OTP_MAX_ATTEMPTS },
      },
      { $inc: { attempts: 1 } },
      { sort: { createdAt: -1 }, returnDocument: "after" }
    );
    if (!otp) return invalid();

    const expected = Buffer.from(otp.codeHash, "hex");
    const given = Buffer.from(hashCode(email, code), "hex");
    if (!crypto.timingSafeEqual(expected, given)) {
      if (otp.attempts >= OTP_MAX_ATTEMPTS) {
        await Otp.updateOne({ _id: otp._id }, { used: true });
        return res.status(400).json({ message: "Too many wrong tries. Please request a new code." });
      }
      return invalid();
    }

    // Single use: only the request that flips it gets in
    const claimed = await Otp.updateOne({ _id: otp._id, used: false }, { used: true });
    if (!claimed.modifiedCount) return invalid();

    const affiliate = await Affiliate.findOne({ _id: otp.affiliateId, status: "ACTIVE" });
    if (!affiliate) return invalid();

    affiliate.lastLoginAt = new Date();
    await affiliate.save();

    res.json({ token: signToken(affiliate._id, "creator") });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/auth/creator/change-password
router.post("/creator/change-password", requireAuth("creator"), async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword || newPassword.length < 8) {
      return res
        .status(400)
        .json({ message: "Current password and a new password (8+ characters) are required." });
    }

    const affiliate = await Affiliate.findById(req.user.id).select("+passwordHash");
    if (!affiliate || !(await bcrypt.compare(currentPassword, affiliate.passwordHash))) {
      return res.status(401).json({ message: "Current password is wrong." });
    }

    affiliate.passwordHash = await bcrypt.hash(newPassword, 10);
    await affiliate.save();
    res.json({ message: "Password updated" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;