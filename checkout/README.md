# Checkout service

A small Node service that accepts a one-time payment for a shop product with
[Stripe Checkout](https://docs.stripe.com/payments/checkout). It creates the
Stripe product and price for a SKU, opens a hosted Checkout Session for it, and
fulfils the order when the `checkout.session.completed` webhook arrives.

It is a standalone service. Nothing in it is wired into `index.html`, and no
Stripe link is published anywhere on the site — see
[Not on the shop page yet](#not-on-the-shop-page-yet).

## Layout

| Path | What it does |
|---|---|
| `bin/onboard.js` | CLI that creates (or adopts) the Stripe product and price for one SKU |
| `src/server.js` | HTTP routes: create a session, receive webhooks, read an order |
| `src/catalog.js` | Product and price creation, and the SKU → Stripe identifier records |
| `src/checkout.js` | Checkout Session creation |
| `src/webhook.js` | Signature verification and `checkout.session.completed` fulfilment |
| `src/orders.js` | Order records keyed by Checkout Session id |
| `src/store.js` | JSON-file datastore behind the catalog and the orders |

The datastore is two JSON files under `checkout/data/` (git-ignored). It keeps
the Stripe identifiers this service needs — `product_id`, `price_id`,
`payment_intent_id`, `customer_id` — next to the shop's own product slug, so
swapping in a real database means replacing `src/store.js` and nothing else.

## Setup

```sh
cd checkout
npm install
cp .env.example .env
```

Fill in `.env`:

- `STRIPE_SECRET_KEY` — Stripe Dashboard → Developers → API keys. Use a **test**
  key (`sk_test_…`) until the flow has been exercised end to end.
- `STRIPE_WEBHOOK_SECRET` — the signing secret of the webhook endpoint, or the
  `whsec_…` value printed by `stripe listen`.
- `PUBLIC_BASE_URL` — the origin buyers return to after paying.

Never commit `.env`; it is git-ignored.

## Register a product

Each shop product is onboarded once. The SKU is the shop's own slug, and it is
written into the Stripe product's metadata so a repeat run reuses the product
instead of creating a duplicate:

```sh
npm run onboard -- --sku raw-techno-kicks --name "Raw Techno Kicks" --amount 2000 --currency usd
```

`--amount` is in the smallest currency unit, so `2000` is 20.00. The product is
created with an inline `default_price_data`, and both identifiers land in
`data/catalog.json`.

With a live secret key the command refuses to run unless `--live-mode` is also
passed: a Stripe price can be deactivated but never deleted, so a mistyped
amount is permanent.

## Run it

```sh
npm start
```

| Route | Purpose |
|---|---|
| `POST /create-checkout-session` | `{"sku": "raw-techno-kicks", "quantity": 1}` → `{"checkout_session_id", "url"}`. Open `url` to pay. |
| `POST /webhooks/stripe` | Stripe's webhook endpoint. Verifies the signature, then fulfils the order. |
| `GET /orders/:checkout_session_id` | The stored order, for the success page. |
| `GET /products` | The onboarded SKUs. |
| `GET /healthz` | Liveness probe. |

The amount is never taken from the request: the client sends a SKU, and the
price comes from the catalog.

## Webhooks

In development, forward events with the Stripe CLI:

```sh
stripe listen --forward-to localhost:4242/webhooks/stripe
```

Put the `whsec_…` it prints into `STRIPE_WEBHOOK_SECRET`. In production, add an
endpoint in the Dashboard (Developers → Webhooks) subscribed to
`checkout.session.completed` and use that endpoint's signing secret.

Fulfilment happens in the webhook, not on the success URL: a buyer can close the
tab before being redirected. Deliveries are retried by Stripe, so
`markOrderPaid` is idempotent — a session already marked paid is left alone.

## Tests

```sh
npm test
```

The tests drive the catalog, session creation, webhook fulfilment, and the HTTP
routes against a stubbed Stripe client. They make no network calls and need no
API key.

## Not on the shop page yet

`CLAUDE.md` sets the rule for this repository: a payment button goes on the shop
only after the payment object behind it has been read back from the provider and
matched against the rate card. This service ships the integration, not a live
button — `index.html` is untouched, and `scripts/verify.mjs` still fails the
build if the string `stripe` appears in it.

Before a Stripe purchase is offered to a buyer:

1. Onboard the SKU and read the created product and price back from the
   Dashboard — name, amount, currency, and tax behaviour.
2. Load the hosted Checkout page and confirm the total the buyer actually sees.
3. Confirm the amounts against the rate card with Gabriel.
4. Only then add the button, and update the verification list in
   `scripts/verify.mjs` in the same change.
