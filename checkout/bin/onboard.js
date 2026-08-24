#!/usr/bin/env node
import process from "node:process";
import { parseArgs } from "node:util";

import { onboardProduct } from "../src/catalog.js";
import { loadConfig, requireSecretKey } from "../src/config.js";
import { createStripeClient } from "../src/stripe-client.js";

const USAGE = `Usage: npm run onboard -- --sku <slug> --name <title> --amount <cents> [options]

Creates the Stripe product and its default price for one shop SKU, or reuses
them if they already exist, and records the identifiers in the local catalog.

Options:
  --sku          Shop product slug used as the catalog key and Stripe metadata.
  --name         Product name shown to the buyer on the Checkout page.
  --amount       Price in the smallest currency unit (2000 = 20.00).
  --currency     Three-letter currency code. Default: usd.
  --description  Optional product description.
  --live-mode    Required acknowledgement when the secret key is a live key.
`;

function parseOptions(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      sku: { type: "string" },
      name: { type: "string" },
      amount: { type: "string" },
      currency: { type: "string", default: "usd" },
      description: { type: "string" },
      "live-mode": { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
  });
  return values;
}

function validate(values) {
  const problems = [];
  if (!values.sku) problems.push("--sku is required.");
  if (!values.name) problems.push("--name is required.");

  const unitAmount = Number.parseInt(values.amount ?? "", 10);
  if (!Number.isInteger(unitAmount) || unitAmount <= 0) {
    problems.push("--amount must be a positive whole number of the smallest currency unit.");
  }
  const currency = (values.currency ?? "").toLowerCase();
  if (!/^[a-z]{3}$/.test(currency)) problems.push("--currency must be a three-letter code.");

  return { problems, unitAmount, currency };
}

export async function onboard(argv) {
  const values = parseOptions(argv);
  if (values.help) {
    console.log(USAGE);
    return 0;
  }

  const { problems, unitAmount, currency } = validate(values);
  if (problems.length) {
    console.error(`${problems.join("\n")}\n\n${USAGE}`);
    return 1;
  }

  const config = loadConfig();
  const secretKey = requireSecretKey(config);

  // Products and prices are permanent records in a real merchant account:
  // a price can never be deleted, only deactivated. Make the operator say so.
  if (/^(sk|rk)_live_/.test(secretKey) && !values["live-mode"]) {
    console.error(
      "STRIPE_SECRET_KEY is a live key, so this would create a real product and price in the\n" +
        "live account. Re-run with --live-mode if that is intended, or point STRIPE_SECRET_KEY\n" +
        "at a test key first.",
    );
    return 1;
  }

  const stripe = createStripeClient(secretKey);
  const { entry, created, reason } = await onboardProduct(stripe, config.dataDir, {
    sku: values.sku,
    name: values.name,
    description: values.description,
    unitAmount,
    currency,
  });

  console.log(
    `${created ? "Created" : "Reused"} ${entry.sku} (${reason}):\n` +
      `  product: ${entry.product_id}\n` +
      `  price:   ${entry.price_id}\n` +
      `  amount:  ${entry.unit_amount} ${entry.currency.toUpperCase()}${entry.livemode ? " (live mode)" : ""}`,
  );
  return 0;
}

try {
  process.exitCode = await onboard(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
