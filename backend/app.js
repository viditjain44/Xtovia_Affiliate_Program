require("dotenv").config();

// The Express app, without starting a server:
//  - on Vercel this file is the entry point (it must export the app)
//  - locally, server.js imports it and listens on a port
const path = require("path");
const express = require("express");
const cors = require("cors");

const { connectDB } = require("./config/db");
const webhooksRouter = require("./routes/webhooks");
const authRouter = require("./routes/auth");
const affiliatesRouter = require("./routes/affiliates");
const creatorRouter = require("./routes/creator");
const commissionsRouter = require("./routes/commissions");
const payoutsRouter = require("./routes/payouts");
const redirectRouter = require("./routes/redirect");
const linksRouter = require("./routes/links");
const trackRouter = require("./routes/track");
const cronRouter = require("./routes/cron");

const REQUIRED_ENV = ["MONGO_URI", "STORE_URL", "JWT_SECRET"];
const missingEnv = () => REQUIRED_ENV.filter((key) => !process.env[key]);

const app = express();

// Real visitor IPs when hosted behind a proxy (Vercel, Render etc.)
app.set("trust proxy", 1);

// "Generate your affiliate link" page (public/index.html) and admin report (/admin).
// On Vercel the public/ folder is served by its CDN and this line is ignored.
app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"] }));

app.get("/health", (req, res) => {
  res.send("Xtovia Affiliate API is running");
});

// Everything below needs the settings and the database - answer with a clear
// error instead of crashing when either is missing
app.use(async (req, res, next) => {
  const missing = missingEnv();
  if (missing.length) {
    console.error(`Missing required environment variables: ${missing.join(", ")}`);
    return res.status(500).json({ message: "Server is not configured" });
  }
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error("MongoDB connection error:", err.message);
    res.status(503).json({ message: "Database unavailable, please try again shortly" });
  }
});

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

app.use("/api/cron", cronRouter); // daily jobs, called by Vercel Cron
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

// Last-resort error handler, so one bad request never takes the function down
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: "Server error" });
});

module.exports = app;
