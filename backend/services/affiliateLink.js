// The link an affiliate shares - it points straight at the Shopify store
// STORE_URL can include a page, e.g. https://xtovia.com/products/hair-revival-system,
// and shoppers land on that page
//
// With a discount code:
//   https://xtovia.com/discount/CODE?redirect=/products/hair-revival-system?ref=CODE
//   Shopify saves the code in the shopper's session (applied automatically at checkout,
//   on anything they buy) and then opens the landing page. The ?ref= lets the theme
//   snippet (shopify/affiliate-tracking.liquid) count the click.
// Without one yet:
//   https://xtovia.com/products/hair-revival-system?ref=CODE

function buildAffiliateLink(affiliate) {
  const store = new URL(process.env.STORE_URL);
  const ref = encodeURIComponent(affiliate.refCode);
  const landingPath = store.pathname;

  if (affiliate.couponCode) {
    const code = encodeURIComponent(affiliate.couponCode);
    return `${store.origin}/discount/${code}?redirect=${landingPath}?ref=${ref}`;
  }
  return `${store.origin}${landingPath}?ref=${ref}`;
}

module.exports = { buildAffiliateLink };
