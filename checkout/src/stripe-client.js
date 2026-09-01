import Stripe from "stripe";

/**
 * Builds the Stripe client. The API version is deliberately left unset so the
 * account's pinned version is used; pin it here only when a specific version is
 * actually required.
 */
export function createStripeClient(secretKey) {
  if (!secretKey) {
    throw new Error("A Stripe secret key is required to create the Stripe client.");
  }
  return new Stripe(secretKey);
}
