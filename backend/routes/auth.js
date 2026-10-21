const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");
const Affiliate = require("../models/Affiliate");
const { requireAuth } = require("../middleware/auth");

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