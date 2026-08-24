import { createServer as createHttpServer } from "node:http";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { InvalidSkuError, UnknownSkuError, listCatalogEntries } from "./catalog.js";
import { InvalidQuantityError, createCheckoutSession } from "./checkout.js";
import { loadConfig, requireSecretKey, requireWebhookSecret } from "./config.js";
import { readOrder } from "./orders.js";
import { createStripeClient } from "./stripe-client.js";
import { handleStripeEvent, verifyStripeEvent } from "./webhook.js";

const MAX_BODY_BYTES = 1024 * 64;

async function readRawBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const error = new Error("Request body is too large.");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function sendJson(response, status, body) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
  });
  response.end(payload);
}

function statusForError(error) {
  if (error instanceof UnknownSkuError) return 404;
  if (error instanceof InvalidSkuError) return 400;
  if (error instanceof InvalidQuantityError) return 400;
  if (error instanceof SyntaxError) return 400;
  if (typeof error.statusCode === "number") return error.statusCode;
  return 500;
}

export function createRequestHandler({ stripe, config }) {
  return async function handleRequest(request, response) {
    const url = new URL(request.url, config.baseUrl);
    const route = `${request.method} ${url.pathname}`;

    try {
      if (route === "GET /healthz") {
        return sendJson(response, 200, { status: "ok" });
      }

      if (route === "GET /products") {
        const entries = await listCatalogEntries(config.dataDir);
        return sendJson(response, 200, { products: Object.values(entries) });
      }

      if (route === "POST /create-checkout-session") {
        const body = await readRawBody(request);
        const { sku, quantity } = body.length ? JSON.parse(body.toString("utf8")) : {};
        if (!sku) return sendJson(response, 400, { error: "A sku is required." });

        const { session } = await createCheckoutSession(stripe, {
          dataDir: config.dataDir,
          sku,
          quantity,
          successUrl: config.successUrl,
          cancelUrl: config.cancelUrl,
        });
        return sendJson(response, 200, { checkout_session_id: session.id, url: session.url });
      }

      if (route === "POST /webhooks/stripe") {
        // Resolved before the try below so a missing secret surfaces as a
        // server fault rather than as a rejected delivery.
        const webhookSecret = requireWebhookSecret(config);
        const payload = await readRawBody(request);
        let event;
        try {
          event = verifyStripeEvent(stripe, {
            payload,
            signature: request.headers["stripe-signature"],
            webhookSecret,
          });
        } catch (error) {
          // A failed signature check is the caller's problem, not a server
          // fault: answer 400 so Stripe stops retrying a forged delivery.
          console.error(`Rejected webhook delivery: ${error.message}`);
          return sendJson(response, 400, { error: "Webhook signature verification failed." });
        }

        const result = await handleStripeEvent(event, { dataDir: config.dataDir });
        console.log(`Webhook ${event.type} (${event.id}): ${result.reason}`);
        return sendJson(response, 200, { received: true });
      }

      const orderMatch = url.pathname.match(/^\/orders\/([^/]+)$/);
      if (request.method === "GET" && orderMatch) {
        const order = await readOrder(config.dataDir, decodeURIComponent(orderMatch[1]));
        if (!order) return sendJson(response, 404, { error: "Unknown checkout session." });
        return sendJson(response, 200, { order });
      }

      return sendJson(response, 404, { error: `No route for ${route}.` });
    } catch (error) {
      const status = statusForError(error);
      if (status >= 500) console.error(`${route} failed:`, error);
      return sendJson(response, status, { error: error.message });
    }
  };
}

export function createCheckoutServer({ config = loadConfig(), stripe } = {}) {
  const client = stripe ?? createStripeClient(requireSecretKey(config));
  return createHttpServer(createRequestHandler({ stripe: client, config }));
}

function start() {
  const config = loadConfig();
  const server = createCheckoutServer({ config });
  server.listen(config.port, () => {
    console.log(`Checkout service listening on ${config.baseUrl} (port ${config.port})`);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  start();
}
