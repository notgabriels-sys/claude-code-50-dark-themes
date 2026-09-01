import { env as processEnv } from "node:process";
import { fileURLToPath } from "node:url";

const DEFAULT_PORT = 4242;
const DEFAULT_BASE_URL = "http://localhost:4242";

function trimmed(value) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Reads the service configuration out of the environment. Nothing is validated
 * here: a missing key only matters once a request actually needs it, and the
 * onboard CLI must be able to run without a webhook secret.
 */
export function loadConfig(env = processEnv) {
  const baseUrl = trimmed(env.PUBLIC_BASE_URL) || DEFAULT_BASE_URL;
  const port = Number.parseInt(trimmed(env.PORT), 10);

  return {
    secretKey: trimmed(env.STRIPE_SECRET_KEY),
    webhookSecret: trimmed(env.STRIPE_WEBHOOK_SECRET),
    port: Number.isInteger(port) ? port : DEFAULT_PORT,
    baseUrl,
    successUrl:
      trimmed(env.CHECKOUT_SUCCESS_URL) ||
      `${baseUrl}/order/complete?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: trimmed(env.CHECKOUT_CANCEL_URL) || `${baseUrl}/order/cancelled`,
    dataDir: trimmed(env.CHECKOUT_DATA_DIR) || fileURLToPath(new URL("../data/", import.meta.url)),
  };
}

export function requireSecretKey(config) {
  if (!config.secretKey) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set. Copy .env.example to .env and paste the secret key " +
        "from the Stripe Dashboard (Developers -> API keys).",
    );
  }
  return config.secretKey;
}

export function requireWebhookSecret(config) {
  if (!config.webhookSecret) {
    throw new Error(
      "STRIPE_WEBHOOK_SECRET is not set. Take the signing secret from the webhook endpoint " +
        "in the Stripe Dashboard (Developers -> Webhooks), or from `stripe listen`.",
    );
  }
  return config.webhookSecret;
}
