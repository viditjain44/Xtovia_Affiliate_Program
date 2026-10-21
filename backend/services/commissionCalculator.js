// Money helpers for commissions
// Commission is paid on what the customer paid for products:
// after discounts, without shipping, and without tax

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

// Amount of a Shopify order that commission is calculated on
function getOrderBase(order) {
  const subtotal = Number(order.current_subtotal_price ?? order.subtotal_price ?? 0);
  // When prices include tax, the subtotal has tax inside it - take it out
  const tax = order.taxes_included ? Number(order.current_total_tax ?? order.total_tax ?? 0) : 0;
  return round2(Math.max(0, subtotal - tax));
}

// Amount of a Shopify refund to take off the order base
function getRefundBase(refund, taxesIncluded) {
  const total = (refund.refund_line_items || []).reduce((sum, item) => {
    const subtotal = Number(item.subtotal || 0);
    const tax = taxesIncluded ? Number(item.total_tax || 0) : 0;
    return sum + subtotal - tax;
  }, 0);
  return round2(Math.max(0, total));
}

function calculateCommission(base, ratePercent) {
  return round2((base * ratePercent) / 100);
}

module.exports = { round2, getOrderBase, getRefundBase, calculateCommission };
