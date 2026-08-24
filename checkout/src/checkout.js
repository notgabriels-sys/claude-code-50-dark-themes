import { requireCatalogEntry } from "./catalog.js";
import { recordPendingOrder } from "./orders.js";

export class InvalidQuantityError extends Error {
  constructor(quantity) {
    super(`Quantity must be a positive whole number; got ${JSON.stringify(quantity)}.`);
    this.name = "InvalidQuantityError";
  }
}

function normaliseQuantity(quantity) {
  if (quantity === undefined || quantity === null || quantity === "") return 1;
  const parsed = Number(quantity);
  if (!Number.isInteger(parsed) || parsed < 1) throw new InvalidQuantityError(quantity);
  return parsed;
}

/**
 * Creates a hosted Checkout Session for one SKU and records the pending order.
 * The price comes from the catalog rather than the request body: the client
 * never gets to name an amount.
 */
export async function createCheckoutSession(stripe, { dataDir, sku, quantity, successUrl, cancelUrl }) {
  const lineItemQuantity = normaliseQuantity(quantity);
  const entry = await requireCatalogEntry(dataDir, sku);

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{ price: entry.price_id, quantity: lineItemQuantity }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: sku,
    metadata: { sku },
  });

  const order = await recordPendingOrder(dataDir, { session, sku, entry, quantity: lineItemQuantity });
  return { session, order };
}
