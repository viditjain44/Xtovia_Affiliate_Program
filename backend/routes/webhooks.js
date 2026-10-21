const express = require("express");
const router = express.Router();
const Affiliate = require("../models/Affiliate");
const Commission = require("../models/Commission");
const verifyShopifyWebhook = require("../middleware/verifyShopifyWebhook");
const {
  round2,
  getOrderBase,
  getRefundBase,
  calculateCommission,
} = require("../services/commissionCalculator");

// Every webhook must have a valid Shopify signature
router.use(verifyShopifyWebhook);

// Finds which affiliate an order belongs to: tracking link first, then coupon code
async function findAffiliateForOrder(order) {
  const refAttr = (order.note_attributes || []).find((a) => a.name === "affiliate_ref");
  if (refAttr && refAttr.value) {
    const byRef = await Affiliate.findOne({ refCode: String(refAttr.value).toUpperCase() });
    if (byRef) return { affiliate: byRef, source: "LINK" };
  }

  const codes = (order.discount_codes || []).map((d) => String(d.code).toUpperCase());
  if (codes.length) {
    const byCoupon = await Affiliate.findOne({ couponCode: { $in: codes } });
    if (byCoupon) return { affiliate: byCoupon, source: "COUPON" };
  }

  return { affiliate: null, source: null };
}

// POST /webhooks/orders-paid
router.post("/orders-paid", async (req, res) => {
  try {
    const order = req.shopifyPayload;
    const { affiliate, source } = await findAffiliateForOrder(order);

    if (!affiliate || affiliate.status !== "ACTIVE") {
      return res.status(200).send("No active affiliate on this order");
    }

    const orderBase = getOrderBase(order);
    const customerEmail = (order.email || "").toLowerCase();
    const isSelfReferral = customerEmail && customerEmail === affiliate.email;

    await Commission.create({
      affiliateId: affiliate._id,
      refCode: affiliate.refCode,
      shopifyOrderId: String(order.id),
      orderName: order.name,
      orderBase,
      currency: order.currency || "INR",
      taxesIncluded: Boolean(order.taxes_included),
      customerEmail,
      source,
      commissionRate: affiliate.commissionRate,
      amount: calculateCommission(orderBase, affiliate.commissionRate),
      flagged: Boolean(isSelfReferral),
      flagReason: isSelfReferral ? "Creator bought with their own link/code" : undefined,
    });

    res.status(200).send("Commission recorded");
  } catch (err) {
    // Shopify sometimes sends the same webhook twice - ignore the duplicate
    if (err.code === 11000) return res.status(200).send("Already recorded");
    console.error("[orders-paid]", err);
    res.status(500).send("Error"); // Shopify will retry
  }
});

// POST /webhooks/refunds-create
router.post("/refunds-create", async (req, res) => {
  try {
    const refund = req.shopifyPayload;
    const commission = await Commission.findOne({ shopifyOrderId: String(refund.order_id) });
    if (!commission) return res.status(200).send("No commission for this order");

    const refundId = String(refund.id);
    if (commission.processedRefundIds.includes(refundId)) {
      return res.status(200).send("Refund already processed");
    }

    commission.processedRefundIds.push(refundId);
    commission.refundedBase = round2(
      commission.refundedBase + getRefundBase(refund, commission.taxesIncluded)
    );

    if (commission.status === "PAID") {
      // Money already sent - flag it so you can adjust the next payout manually
      commission.needsReview = true;
      commission.flagReason = "Order refunded after commission was paid";
    } else if (commission.status !== "REVERSED") {
      const remainingBase = Math.max(0, commission.orderBase - commission.refundedBase);
      commission.amount = calculateCommission(remainingBase, commission.commissionRate);
      if (commission.amount === 0) {
        commission.status = "REVERSED";
        commission.reversedReason = "Order fully refunded";
      }
    }

    await commission.save();
    res.status(200).send("Refund processed");
  } catch (err) {
    console.error("[refunds-create]", err);
    res.status(500).send("Error");
  }
});

// POST /webhooks/orders-cancelled
router.post("/orders-cancelled", async (req, res) => {
  try {
    const order = req.shopifyPayload;
    const commission = await Commission.findOne({ shopifyOrderId: String(order.id) });
    if (!commission) return res.status(200).send("No commission for this order");

    if (commission.status === "PAID") {
      commission.needsReview = true;
      commission.flagReason = "Order cancelled after commission was paid";
    } else {
      commission.status = "REVERSED";
      commission.reversedReason = "Order cancelled";
    }

    await commission.save();
    res.status(200).send("Cancellation processed");
  } catch (err) {
    console.error("[orders-cancelled]", err);
    res.status(500).send("Error");
  }
});

module.exports = router;