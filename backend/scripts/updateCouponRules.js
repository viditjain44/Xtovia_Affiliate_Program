// Applies the current coupon rules (one use per customer) to every affiliate coupon
// that already exists in Shopify. New coupons get these rules automatically.
// Run: npm run update-coupons            (shows what would change)
//      npm run update-coupons -- --apply (makes the change in Shopify)
require("dotenv").config();
const mongoose = require("mongoose");
const Affiliate = require("../models/Affiliate");
const { applyEligibilityRules } = require("../services/shopifyDiscounts");

async function main() {
  const apply = process.argv.includes("--apply");
  await mongoose.connect(process.env.MONGO_URI);

  const affiliates = await Affiliate.find({ shopifyDiscountId: { $exists: true, $ne: null } })
    .select("fullName couponCode shopifyDiscountId")
    .lean();

  console.log(`${affiliates.length} affiliate coupon(s) found${apply ? "" : " (dry run - add --apply to change them)"}`);

  let failed = 0;
  for (const a of affiliates) {
    if (!apply) {
      console.log(`  would update ${a.couponCode} (${a.fullName})`);
      continue;
    }
    try {
      const updated = await applyEligibilityRules(a.shopifyDiscountId);
      console.log(`  ${a.couponCode}: once per customer = ${updated.appliesOncePerCustomer}`);
    } catch (err) {
      failed++;
      console.log(`  ${a.couponCode}: FAILED - ${err.message}`);
    }
  }

  if (failed) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
