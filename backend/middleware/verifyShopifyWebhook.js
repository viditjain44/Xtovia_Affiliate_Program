const crypto = require("crypto");

// Confirms a webhook really came from Shopify, not someone faking orders
module.exports = function verifyShopifyWebhook(req, res, next) {
  const hmacHeader = req.get("X-Shopify-Hmac-Sha256");
  // Webhooks registered by an app (scripts/registerWebhooks.js) are signed with its client secret
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET || process.env.SHOPIFY_CLIENT_SECRET;

  if (!hmacHeader || !secret || !Buffer.isBuffer(req.body)) {
    return res.status(401).send("Unauthorized");
  }

  const digest = crypto
    .createHmac("sha256", secret)
    .update(req.body)
    .digest("base64");

  const expected = Buffer.from(digest);
  const received = Buffer.from(hmacHeader);

  if (
    expected.length !== received.length ||
    !crypto.timingSafeEqual(expected, received)
  ) {
    return res.status(401).send("Invalid signature");
  }

  try {
    req.shopifyPayload = JSON.parse(req.body.toString("utf8"));
  } catch (err) {
    return res.status(400).send("Invalid JSON");
  }

  next();
};