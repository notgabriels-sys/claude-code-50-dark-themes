import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";

import {
  InvalidSkuError,
  UnknownSkuError,
  onboardProduct,
  readCatalogEntry,
  saveCatalogEntry,
} from "../src/catalog.js";
import { InvalidQuantityError, createCheckoutSession } from "../src/checkout.js";
import { ORDER_PAID, ORDER_PENDING, readOrder } from "../src/orders.js";
import { createRequestHandler } from "../src/server.js";
import { handleStripeEvent } from "../src/webhook.js";

let dataDir;

before(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "checkout-test-"));
});

after(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

beforeEach(async () => {
  await rm(join(dataDir, "catalog.json"), { force: true });
  await rm(join(dataDir, "orders.json"), { force: true });
});

function createStripeStub({ searchResult = [], sessionUrl = "https://checkout.stripe.com/c/pay/cs_test_1" } = {}) {
  const calls = [];
  return {
    calls,
    products: {
      async create(params) {
        calls.push({ method: "products.create", params });
        return { id: "prod_test_1", name: params.name, livemode: false, default_price: "price_test_1" };
      },
      async search(params) {
        calls.push({ method: "products.search", params });
        return { data: searchResult };
      },
      async update(id, params) {
        calls.push({ method: "products.update", params: { id, ...params } });
        return { id, ...params };
      },
    },
    prices: {
      async create(params) {
        calls.push({ method: "prices.create", params });
        return { id: "price_test_2", ...params };
      },
      async retrieve(id) {
        calls.push({ method: "prices.retrieve", params: { id } });
        return { id, unit_amount: 2000, currency: "usd" };
      },
    },
    checkout: {
      sessions: {
        async create(params) {
          calls.push({ method: "checkout.sessions.create", params });
          return { id: "cs_test_1", url: sessionUrl, amount_total: 2000, currency: "usd" };
        },
      },
    },
    webhooks: {
      constructEvent() {
        throw new Error("No signatures found matching the expected signature for payload.");
      },
    },
  };
}

const catalogEntry = {
  sku: "raw-techno-kicks",
  name: "Raw Techno Kicks",
  product_id: "prod_test_1",
  price_id: "price_test_1",
  unit_amount: 2000,
  currency: "usd",
  livemode: false,
};

describe("catalog onboarding", () => {
  it("creates the product with an inline default price and stores both identifiers", async () => {
    const stripe = createStripeStub();

    const { entry, created } = await onboardProduct(stripe, dataDir, {
      sku: "raw-techno-kicks",
      name: "Raw Techno Kicks",
      unitAmount: 2000,
      currency: "usd",
    });

    const create = stripe.calls.find((call) => call.method === "products.create");
    assert.deepEqual(create.params.default_price_data, { currency: "usd", unit_amount: 2000 });
    assert.equal(create.params.metadata.sku, "raw-techno-kicks");
    assert.equal(created, true);
    assert.equal(entry.product_id, "prod_test_1");
    assert.equal(entry.price_id, "price_test_1");
    assert.deepEqual(await readCatalogEntry(dataDir, "raw-techno-kicks"), entry);
  });

  it("reuses the recorded product instead of creating a second one", async () => {
    await saveCatalogEntry(dataDir, catalogEntry);
    const stripe = createStripeStub();

    const { entry, created } = await onboardProduct(stripe, dataDir, {
      sku: "raw-techno-kicks",
      name: "Raw Techno Kicks",
      unitAmount: 2000,
      currency: "usd",
    });

    assert.equal(created, false);
    assert.equal(entry.price_id, "price_test_1");
    assert.deepEqual(stripe.calls, []);
  });

  it("refuses a SKU that would not be safe in a Stripe search query", async () => {
    const stripe = createStripeStub();
    await assert.rejects(
      onboardProduct(stripe, dataDir, {
        sku: "kicks' OR active:'true",
        name: "Raw Techno Kicks",
        unitAmount: 2000,
        currency: "usd",
      }),
      InvalidSkuError,
    );
    assert.deepEqual(stripe.calls, []);
  });

  it("adopts a product that already carries the SKU in Stripe", async () => {
    const stripe = createStripeStub({
      searchResult: [{ id: "prod_existing", name: "Raw Techno Kicks", livemode: false, default_price: null }],
    });

    const { entry, created } = await onboardProduct(stripe, dataDir, {
      sku: "raw-techno-kicks",
      name: "Raw Techno Kicks",
      unitAmount: 2000,
      currency: "usd",
    });

    assert.equal(created, false);
    assert.equal(entry.product_id, "prod_existing");
    assert.equal(entry.price_id, "price_test_2");
    assert.ok(stripe.calls.some((call) => call.method === "products.update"));
  });
});

describe("creating a Checkout Session", () => {
  it("charges the catalog price and records a pending order", async () => {
    await saveCatalogEntry(dataDir, catalogEntry);
    const stripe = createStripeStub();

    const { session, order } = await createCheckoutSession(stripe, {
      dataDir,
      sku: "raw-techno-kicks",
      quantity: 2,
      successUrl: "https://example.com/order/complete?session_id={CHECKOUT_SESSION_ID}",
      cancelUrl: "https://example.com/order/cancelled",
    });

    const create = stripe.calls.find((call) => call.method === "checkout.sessions.create");
    assert.equal(create.params.mode, "payment");
    assert.deepEqual(create.params.line_items, [{ price: "price_test_1", quantity: 2 }]);
    assert.equal(create.params.success_url, "https://example.com/order/complete?session_id={CHECKOUT_SESSION_ID}");
    assert.equal(create.params.cancel_url, "https://example.com/order/cancelled");
    assert.equal(create.params.metadata.sku, "raw-techno-kicks");
    assert.equal(session.id, "cs_test_1");

    assert.equal(order.status, ORDER_PENDING);
    assert.equal(order.price_id, "price_test_1");
    assert.equal(order.quantity, 2);
    assert.equal((await readOrder(dataDir, "cs_test_1")).sku, "raw-techno-kicks");
  });

  it("refuses a SKU that has not been onboarded", async () => {
    const stripe = createStripeStub();
    await assert.rejects(
      createCheckoutSession(stripe, { dataDir, sku: "not-a-product", successUrl: "u", cancelUrl: "u" }),
      UnknownSkuError,
    );
    assert.deepEqual(stripe.calls, []);
  });

  it("refuses a non-positive quantity", async () => {
    await saveCatalogEntry(dataDir, catalogEntry);
    const stripe = createStripeStub();
    await assert.rejects(
      createCheckoutSession(stripe, {
        dataDir,
        sku: "raw-techno-kicks",
        quantity: 0,
        successUrl: "u",
        cancelUrl: "u",
      }),
      InvalidQuantityError,
    );
  });
});

describe("handling checkout.session.completed", () => {
  const completedSession = {
    id: "cs_test_1",
    object: "checkout_session",
    payment_status: "paid",
    amount_total: 4000,
    currency: "usd",
    payment_intent: "pi_test_1",
    customer: "cus_test_1",
    customer_details: { email: "buyer@example.com" },
    metadata: { sku: "raw-techno-kicks" },
  };

  async function seedPendingOrder() {
    await saveCatalogEntry(dataDir, catalogEntry);
    await createCheckoutSession(createStripeStub(), {
      dataDir,
      sku: "raw-techno-kicks",
      quantity: 2,
      successUrl: "u",
      cancelUrl: "u",
    });
  }

  it("marks the pending order paid and stores the payment identifiers", async () => {
    await seedPendingOrder();

    const result = await handleStripeEvent(
      { id: "evt_1", type: "checkout.session.completed", data: { object: completedSession } },
      { dataDir },
    );

    assert.equal(result.fulfilled, true);
    const order = await readOrder(dataDir, "cs_test_1");
    assert.equal(order.status, ORDER_PAID);
    assert.equal(order.payment_intent_id, "pi_test_1");
    assert.equal(order.customer_id, "cus_test_1");
    assert.equal(order.customer_email, "buyer@example.com");
    assert.equal(order.amount_total, 4000);
    assert.equal(order.sku, "raw-techno-kicks");
  });

  it("does not fulfil the same session twice", async () => {
    await seedPendingOrder();
    const event = { id: "evt_1", type: "checkout.session.completed", data: { object: completedSession } };

    await handleStripeEvent(event, { dataDir });
    const replay = await handleStripeEvent(event, { dataDir });

    assert.equal(replay.fulfilled, false);
    assert.equal(replay.order.status, ORDER_PAID);
  });

  it("leaves an unpaid session pending", async () => {
    await seedPendingOrder();

    const result = await handleStripeEvent(
      {
        id: "evt_2",
        type: "checkout.session.completed",
        data: { object: { ...completedSession, payment_status: "unpaid" } },
      },
      { dataDir },
    );

    assert.equal(result.fulfilled, false);
    assert.equal((await readOrder(dataDir, "cs_test_1")).status, ORDER_PENDING);
  });

  it("ignores event types it has no handler for", async () => {
    const result = await handleStripeEvent(
      { id: "evt_3", type: "payment_intent.succeeded", data: { object: {} } },
      { dataDir },
    );
    assert.equal(result.handled, false);
  });
});

describe("HTTP routes", () => {
  async function withServer(stripe, run) {
    const config = {
      baseUrl: "http://127.0.0.1",
      dataDir,
      webhookSecret: "whsec_test",
      successUrl: "https://example.com/order/complete?session_id={CHECKOUT_SESSION_ID}",
      cancelUrl: "https://example.com/order/cancelled",
    };
    const server = createServer(createRequestHandler({ stripe, config }));
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    try {
      await run(origin);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  }

  it("returns the hosted Checkout URL for a known SKU", async () => {
    await saveCatalogEntry(dataDir, catalogEntry);
    await withServer(createStripeStub(), async (origin) => {
      const response = await fetch(`${origin}/create-checkout-session`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sku: "raw-techno-kicks", quantity: 1 }),
      });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.checkout_session_id, "cs_test_1");
      assert.equal(body.url, "https://checkout.stripe.com/c/pay/cs_test_1");
    });
  });

  it("answers 404 for a SKU with no Stripe product", async () => {
    await withServer(createStripeStub(), async (origin) => {
      const response = await fetch(`${origin}/create-checkout-session`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sku: "not-a-product" }),
      });
      assert.equal(response.status, 404);
    });
  });

  it("rejects a webhook delivery whose signature does not verify", async () => {
    await withServer(createStripeStub(), async (origin) => {
      const response = await fetch(`${origin}/webhooks/stripe`, {
        method: "POST",
        headers: { "stripe-signature": "t=1,v1=nope" },
        body: JSON.stringify({ id: "evt_forged", type: "checkout.session.completed" }),
      });
      assert.equal(response.status, 400);
    });
  });

  it("exposes the recorded order for the success page", async () => {
    await saveCatalogEntry(dataDir, catalogEntry);
    const stripe = createStripeStub();
    await createCheckoutSession(stripe, {
      dataDir,
      sku: "raw-techno-kicks",
      quantity: 1,
      successUrl: "u",
      cancelUrl: "u",
    });
    await withServer(stripe, async (origin) => {
      const response = await fetch(`${origin}/orders/cs_test_1`);
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.order.sku, "raw-techno-kicks");
      assert.equal(body.order.status, ORDER_PENDING);
    });
  });
});
