const { shopifyGraphQL } = require("../config/shopify");

const CREATE_DISCOUNT = `
  mutation CreateAffiliateDiscount($basicCodeDiscount: DiscountCodeBasicInput!) {
    discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
      codeDiscountNode { id }
      userErrors { field message }
    }
  }
`;

// Creates a "% off everything" discount code in Shopify and returns its id
// (needs the write_discounts access scope)
async function createAffiliateDiscount({ code, title, percent }) {
  const data = await shopifyGraphQL(CREATE_DISCOUNT, {
    basicCodeDiscount: {
      title,
      code,
      startsAt: new Date().toISOString(),
      customerSelection: { all: true },
      customerGets: {
        value: { percentage: percent / 100 },
        items: { all: true },
      },
      appliesOncePerCustomer: false,
    },
  });

  const result = data.discountCodeBasicCreate;
  if (result.userErrors && result.userErrors.length) {
    throw new Error(result.userErrors.map((e) => e.message).join("; "));
  }
  return result.codeDiscountNode.id;
}

module.exports = { createAffiliateDiscount };
