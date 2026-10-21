const cron = require("node-cron");
const Commission = require("../models/Commission");

// Approves pending commissions once the return window has passed
// (flagged ones stay pending until you review them)
async function approveDueCommissions() {
  const holdDays = Number(process.env.COMMISSION_HOLD_DAYS || 30);
  const cutoff = new Date(Date.now() - holdDays * 24 * 60 * 60 * 1000);

  const result = await Commission.updateMany(
    { status: "PENDING", flagged: false, needsReview: false, createdAt: { $lte: cutoff } },
    { status: "APPROVED", approvedAt: new Date() }
  );

  if (result.modifiedCount) {
    console.log(`[approveCommissions] Approved ${result.modifiedCount} commission(s)`);
  }
}

// Runs every day at 02:00
function startApproveCommissionsJob() {
  cron.schedule("0 2 * * *", () => {
    approveDueCommissions().catch((err) => console.error("[approveCommissions]", err));
  });
}

module.exports = { startApproveCommissionsJob, approveDueCommissions };
