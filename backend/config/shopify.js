// Small helper for calling the Shopify Admin GraphQL API
//
// Two ways to authenticate (set ONE in .env):
//  1. SHOPIFY_ADMIN_ACCESS_TOKEN               - a fixed token (older "custom apps" made in Shopify admin)
//  2. SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET - apps made in the Shopify Dev Dashboard;
//                                                 a short-lived token is fetched and refreshed automatically

let cachedToken = null; // { value, expiresAt }

async function getAccessToken(domain) {
  if (process.env.SHOPIFY_ADMIN_ACCESS_TOKEN) {
    return process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  }

  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  // Reuse the token until 5 minutes before it expires
  if (cachedToken && cachedToken.expiresAt - 5 * 60 * 1000 > Date.now()) {
    return cachedToken.value;
  }

  const res = await fetch(`https://${domain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    throw new Error(`Could not get Shopify access token (${res.status}): ${JSON.stringify(json)}`);
  }

  cachedToken = {
    value: json.access_token,
    expiresAt: Date.now() + (json.expires_in || 3600) * 1000,
  };
  return cachedToken.value;
}

async function shopifyGraphQL(query, variables = {}) {
  const domain = process.env.SHOPIFY_STORE_DOMAIN;
  const version = process.env.SHOPIFY_API_VERSION || "2026-07";
  const token = domain && (await getAccessToken(domain));

  if (!domain || !token) {
    throw new Error(
      "Shopify is not configured: set SHOPIFY_STORE_DOMAIN and either SHOPIFY_ADMIN_ACCESS_TOKEN or SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET in .env"
    );
  }

  const res = await fetch(`https://${domain}/admin/api/${version}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({ query, variables }),
  });

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(`Shopify API error ${res.status}: ${JSON.stringify(json)}`);
  }
  if (json.errors) {
    throw new Error(`Shopify GraphQL error: ${JSON.stringify(json.errors)}`);
  }

  return json.data;
}

module.exports = { shopifyGraphQL };
