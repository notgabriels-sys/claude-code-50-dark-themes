import { markOrderPaid } from "./orders.js";

export const CHECKOUT_COMPLETED = "checkout.session.completed";

/**
 * Verifies the Stripe-Signature header against the raw request body. The body
 * must be the untouched bytes Stripe sent; a re-serialised JSON object will
 * not verify.
 */
export function verifyStripeEvent(stripe, { payload, signature, webhookSecret }) {
  return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
}

async function fulfillCheckoutSession(dataDir, session) {
  if (session.payment_status !== "paid") {
    return { handled: true, fulfilled: false, reason: `payment_status is ${session.payment_status}` };
  }
  const { order, alreadyFulfilled } = await markOrderPaid(dataDir, session);
  return {
    handled: true,
    fulfilled: !alreadyFulfilled,
    reason: alreadyFulfilled ? "order was already fulfilled" : "order marked paid",
    order,
  };
}

export async function handleStripeEvent(event, { dataDir }) {
  if (event.type === CHECKOUT_COMPLETED) {
    return fulfillCheckoutSession(dataDir, event.data.object);
  }
  return { handled: false, fulfilled: false, reason: `no handler for ${event.type}` };
}
