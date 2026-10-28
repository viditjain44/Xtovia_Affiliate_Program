// Local development: npm run dev (Vercel uses app.js directly instead)
const app = require("./app");
const { connectDB } = require("./config/db");
const { startApproveCommissionsJob } = require("./jobs/approveCommissions");

const PORT = process.env.PORT || 5001;

connectDB()
  .then(() => {
    // On Vercel the same job runs through Vercel Cron (see vercel.json)
    startApproveCommissionsJob();
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  });
