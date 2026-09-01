import { readCollection, updateCollection } from "./store.js";

const COLLECTION = "orders";

export const ORDER_PENDING = "pending";
export const ORDER_PAID = "paid";

export async function listOrders(dataDir) {
  return readCollection(dataDir, COLLECTION);
}

export async function readOrder(dataDir, sessionId) {
  const orders = await readCollection(dataDir, COLLECTION);
  return orders[sessionId] ?? null;
}

/**
 * Stores the Checkout Session against the shop SKU the moment the session is
 * created, so the webhook has something to fulfil even if the buyer never
 * returns to the success URL.
 */
export async function recordPendingOrder(dataDir, { session, sku, entry, quantity }) {
  const order = {
    checkout_session_id: session.id,
    sku,
    product_id: entry.product_id,
    price_id: entry.price_id,
    quantity,
    status: ORDER_PENDING,
    amount_total: session.amount_total ?? null,
    currency: session.currency ?? entry.currency,
    payment_intent_id: null,
    customer_id: null,
    customer_email: null,
    created_at: new Date().toISOString(),
    paid_at: null,
  };
  await updateCollection(dataDir, COLLECTION, (orders) => ({ ...orders, [order.checkout_session_id]: order }));
  return order;
}

function identifierOf(value) {
  if (!value) return null;
  return typeof value === "string" ? value : (value.id ?? null);
}

/**
 * Marks the order paid from a completed Checkout Session. Safe to run twice:
 * Stripe retries webhook deliveries, and the same session must not be
 * fulfilled a second time.
 */
export async function markOrderPaid(dataDir, session) {
  const orders = await readCollection(dataDir, COLLECTION);
  const existing = orders[session.id] ?? null;

  if (existing?.status === ORDER_PAID) {
    return { order: existing, alreadyFulfilled: true };
  }

  const order = {
    ...(existing ?? {
      checkout_session_id: session.id,
      sku: session.metadata?.sku ?? null,
      product_id: null,
      price_id: null,
      quantity: null,
      created_at: new Date().toISOString(),
    }),
    status: ORDER_PAID,
    amount_total: session.amount_total ?? existing?.amount_total ?? null,
    currency: session.currency ?? existing?.currency ?? null,
    payment_intent_id: identifierOf(session.payment_intent),
    customer_id: identifierOf(session.customer),
    customer_email:
      session.customer_details?.email ?? session.customer_email ?? existing?.customer_email ?? null,
    paid_at: new Date().toISOString(),
  };

  await updateCollection(dataDir, COLLECTION, (records) => ({ ...records, [session.id]: order }));
  return { order, alreadyFulfilled: false };
}
