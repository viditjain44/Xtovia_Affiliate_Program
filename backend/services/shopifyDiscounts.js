const { shopifyGraphQL } = require("../config/shopify");

// Customer discount for affiliate coupons, from COUPON_DISCOUNT_PERCENT (default 10).
// 0 = tracking-only: no coupons are created and links carry no discount
function couponPercent() {
  const percent = Number(process.env.COUPON_DISCOUNT_PERCENT ?? 10);
  return Number.isFinite(percent) && percent > 0 ? percent : 0;
}

function couponsEnabled() {
  return couponPercent() > 0;
}

// Every affiliate coupon: open to all buyers (first-time buyers have no Shopify customer
// profile yet, so segment-limited discounts would block them), but one use per customer.
// "New customers only" is enforced on the commission side - see services/customerHistory.js
const ELIGIBILITY = {
  context: { all: "ALL" },
  appliesOncePerCustomer: true,
};

const CREATE_DISCOUNT = `
  mutation CreateAffiliateDiscount($basicCodeDiscount: DiscountCodeBasicInput!) {
    discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
      codeDiscountNode { id }
      userErrors { field message }
    }
  }
`;

const UPDATE_DISCOUNT = `
  mutation UpdateAffiliateDiscount($id: ID!, $basicCodeDiscount: DiscountCodeBasicInput!) {
    discountCodeBasicUpdate(id: $id, basicCodeDiscount: $basicCodeDiscount) {
      codeDiscountNode {
        codeDiscount { ... on DiscountCodeBasic { title appliesOncePerCustomer } }
      }
      userErrors { field message }
    }
  }
`;

function throwUserErrors(result) {
  if (result.userErrors && result.userErrors.length) {
    throw new Error(result.userErrors.map((e) => e.message).join("; "));
  }
}

// Creates a "% off everything" discount code in Shopify and returns its id
// (needs the write_discounts access scope)
async function createAffiliateDiscount({ code, title, percent }) {
  const data = await shopifyGraphQL(CREATE_DISCOUNT, {
    basicCodeDiscount: {
      title,
      code,
      startsAt: new Date().toISOString(),
      customerGets: {
        value: { percentage: percent / 100 },
        items: { all: true },
      },
      ...ELIGIBILITY,
    },
  });

  const result = data.discountCodeBasicCreate;
  throwUserErrors(result);
  return result.codeDiscountNode.id;
}

// Brings an existing affiliate coupon in line with the current rules (one use per customer)
async function applyEligibilityRules(discountId) {
  const data = await shopifyGraphQL(UPDATE_DISCOUNT, {
    id: discountId,
    basicCodeDiscount: ELIGIBILITY,
  });

  const result = data.discountCodeBasicUpdate;
  throwUserErrors(result);
  return result.codeDiscountNode.codeDiscount;
}

module.exports = { createAffiliateDiscount, applyEligibilityRules, couponPercent, couponsEnabled };
