const express = require("express");
const router = express.Router();
const { approveDueCommissions } = require("../jobs/approveCommissions");

// Vercel Cron sends "Authorization: Bearer <CRON_SECRET>" when CRON_SECRET is set
// in the project's environment variables - anyone else is turned away
function requireCronSecret(req, res, next) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.get("authorization") !== `Bearer ${secret}`) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
}

// GET /api/cron/approve-commissions - schedule in vercel.json
router.get("/approve-commissions", requireCronSecret, async (req, res) => {
  try {
    const approved = await approveDueCommissions();
    res.json({ approved });
  } catch (err) {
    console.error("[cron/approve-commissions]", err);
    res.status(500).json({ message: "Approval run failed" });
  }
});

module.exports = router;
