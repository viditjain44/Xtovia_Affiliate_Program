require("dotenv").config();

// Stop early with a clear message if required settings are missing
const REQUIRED_ENV = ["MONGO_URI", "STORE_URL", "JWT_SECRET"];
const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`Missing required .env values: ${missing.join(", ")}`);
  process.exit(1);
}

const path = require("path");
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const webhooksRouter = require("./routes/webhooks");
const authRouter = require("./routes/auth");
const affiliatesRouter = require("./routes/affiliates");
const creatorRouter = require("./routes/creator");
const commissionsRouter = require("./routes/commissions");
const payoutsRouter = require("./routes/payouts");
const redirectRouter = require("./routes/redirect");
const linksRouter = require("./routes/links");
const trackRouter = require("./routes/track");
const { startApproveCommissionsJob } = require("./jobs/approveCommissions");

const app = express();

// Real visitor IPs when hosted behind a proxy (Render, Railway etc.)
app.set("trust proxy", 1);

// Click pings from the store theme - has its own CORS rules, so it's mounted first
app.use("/api/track", trackRouter);

// Shopify webhooks need the RAW body to verify their signature,
// so they are mounted BEFORE express.json()
app.use(
  "/webhooks",
  express.raw({ type: "application/json", limit: "2mb" }),
  webhooksRouter
);

app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:5173" }));
app.use(express.json());

// "Generate your affiliate link" page (public/index.html)
app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (req, res) => {
  res.send("Xtovia Affiliate API is running");
});

app.use("/api/links", linksRouter); // public: generate a link from name + email
app.use("/api/auth", authRouter);
app.use("/api/affiliates", affiliatesRouter); // admin only
app.use("/api/creator", creatorRouter); // logged-in creator only
app.use("/api/commissions", commissionsRouter); // admin only
app.use("/api/payouts", payoutsRouter); // admin only
app.use("/r", redirectRouter); // older backend-hosted links keep working

app.use((req, res) => {
  res.status(404).json({ message: "Not found" });
});

const PORT = process.env.PORT || 5001;

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("Connected to MongoDB");
    startApproveCommissionsJob();
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  });