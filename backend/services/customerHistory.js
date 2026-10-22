const { shopifyGraphQL } = require("../config/shopify");

// Recent orders are listed so a just-updated order count can't hide an earlier order.
// (Without the read_all_orders scope Shopify only lists the last 60 days of orders,
// which is why the lifetime numberOfOrders is checked as well.)
const ORDER_CUSTOMER = `
  query OrderCustomer($id: ID!) {
    order(id: $id) {
      createdAt
      customer {
        numberOfOrders
        orders(first: 10, sortKey: CREATED_AT) { nodes { id createdAt } }
      }
    }
  }
`;

// Was this the customer's first ever order on the store?
// Returns { isNew: true | false | null, reason } - null means it couldn't be checked
// (needs read_orders + read_customers)
async function checkFirstOrder(order) {
  const orderGid = order.admin_graphql_api_id || `gid://shopify/Order/${order.id}`;
  const data = await shopifyGraphQL(ORDER_CUSTOMER, { id: orderGid });

  const found = data.order;
  if (!found) return { isNew: null, reason: "Order not found in Shopify" };
  if (!found.customer) return { isNew: null, reason: "Order has no customer attached" };

  const placedAt = new Date(found.createdAt);
  const hasEarlierOrder = found.customer.orders.nodes.some(
    (o) => o.id !== orderGid && new Date(o.createdAt) < placedAt
  );
  if (hasEarlierOrder || Number(found.customer.numberOfOrders) > 1) {
    return { isNew: false, reason: "Customer has ordered before" };
  }

  return { isNew: true, reason: "First order" };
}

module.exports = { checkFirstOrder };
