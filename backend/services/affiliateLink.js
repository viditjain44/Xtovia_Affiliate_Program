const { couponsEnabled } = require("./shopifyDiscounts");

// The link an affiliate shares - it points straight at the Shopify store
// STORE_URL can include a page, e.g. https://xtovia.com/products/hair-revival-system,
// and shoppers land on that page
//
// Tracking-only (COUPON_DISCOUNT_PERCENT=0):
//   https://xtovia.com/products/hair-revival-system?ref=CODE
//   The theme snippet (shopify/affiliate-tracking.liquid) counts the click and remembers
//   the affiliate for 7 days, so the order is credited to them.
// With a discount code:
//   https://xtovia.com/discount/CODE?redirect=/products/hair-revival-system?ref=CODE
//   Shopify saves the code in the shopper's session (applied automatically at checkout,
//   on anything they buy) and then opens the landing page.

function buildAffiliateLink(affiliate) {
  const store = new URL(process.env.STORE_URL);
  const ref = encodeURIComponent(affiliate.refCode);
  const landingPath = store.pathname;

  if (couponsEnabled() && affiliate.couponCode) {
    const code = encodeURIComponent(affiliate.couponCode);
    return `${store.origin}/discount/${code}?redirect=${landingPath}?ref=${ref}`;
  }
  return `${store.origin}${landingPath}?ref=${ref}`;
}

module.exports = { buildAffiliateLink };
