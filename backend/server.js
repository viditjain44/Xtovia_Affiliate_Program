require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const affiliatesRouter = require("./routes/affiliates");
const redirectRouter = require("./routes/redirect");

const app = express();

// Needed so req.ip shows the real visitor IP when hosted behind a proxy (Render, Railway etc.)
app.set("trust proxy", 1);

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Xtovia Affiliate API is running");
});

// Affiliate management API
app.use("/api/affiliates", affiliatesRouter);

// Tracking links: /r/:refCode
app.use("/r", redirectRouter);

const PORT = process.env.PORT || 5001;
const MONGO_URI = process.env.MONGO_URI;

mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log("Connected to MongoDB");
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  });