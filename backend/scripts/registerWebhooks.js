// Tells Shopify to send order events to this backend
// Run once after deploying: npm run register-webhooks
// (PUBLIC_API_URL must be a public https URL Shopify can reach, not localhost)
require("dotenv").config();
const { shopifyGraphQL } = require("../config/shopify");

const TOPICS = {
  ORDERS_PAID: "/webhooks/orders-paid",
  REFUNDS_CREATE: "/webhooks/refunds-create",
  ORDERS_CANCELLED: "/webhooks/orders-cancelled",
};

const CREATE_WEBHOOK = `
  mutation CreateWebhook($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
    webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
      webhookSubscription { id }
      userErrors { field message }
    }
  }
`;

async function main() {
  const apiUrl = process.env.PUBLIC_API_URL;
  if (!apiUrl || !apiUrl.startsWith("https://")) {
    throw new Error("Set PUBLIC_API_URL in .env to your public https backend URL");
  }

  for (const [topic, path] of Object.entries(TOPICS)) {
    const data = await shopifyGraphQL(CREATE_WEBHOOK, {
      topic,
      webhookSubscription: { callbackUrl: `${apiUrl}${path}`, format: "JSON" },
    });
    const { userErrors } = data.webhookSubscriptionCreate;
    if (userErrors.length) {
      console.log(`${topic}: ${userErrors.map((e) => e.message).join("; ")}`);
    } else {
      console.log(`${topic}: registered -> ${apiUrl}${path}`);
    }
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
