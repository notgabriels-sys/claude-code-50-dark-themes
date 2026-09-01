import { readCollection, updateCollection } from "./store.js";

const COLLECTION = "catalog";

const SKU_PATTERN = /^[a-z0-9][a-z0-9._-]*$/i;

export class InvalidSkuError extends Error {
  constructor(sku) {
    super(
      `"${sku}" is not a usable SKU. Use the shop's product slug: letters, digits, ` +
        "dots, dashes and underscores only.",
    );
    this.name = "InvalidSkuError";
  }
}

/** Guards the SKU before it is interpolated into a Stripe search query. */
export function assertValidSku(sku) {
  if (typeof sku !== "string" || !SKU_PATTERN.test(sku)) throw new InvalidSkuError(sku);
  return sku;
}

export class UnknownSkuError extends Error {
  constructor(sku) {
    super(
      `No Stripe product is registered for SKU "${sku}". Run ` +
        `\`npm run onboard -- --sku ${sku} --name "..." --amount <cents> --currency <code>\` first.`,
    );
    this.name = "UnknownSkuError";
    this.sku = sku;
  }
}

/** All SKUs this deployment can sell, keyed by the shop's own product slug. */
export async function listCatalogEntries(dataDir) {
  return readCollection(dataDir, COLLECTION);
}

export async function readCatalogEntry(dataDir, sku) {
  const entries = await readCollection(dataDir, COLLECTION);
  return entries[sku] ?? null;
}

export async function requireCatalogEntry(dataDir, sku) {
  const entry = await readCatalogEntry(dataDir, sku);
  if (!entry) throw new UnknownSkuError(sku);
  return entry;
}

export async function saveCatalogEntry(dataDir, entry) {
  await updateCollection(dataDir, COLLECTION, (entries) => ({
    ...entries,
    [entry.sku]: entry,
  }));
  return entry;
}

/**
 * Looks for a product already carrying this SKU in its metadata, so repeated
 * onboarding runs reuse the product instead of creating a duplicate. Stripe's
 * search index is eventually consistent, hence the local catalog is consulted
 * first by `onboardProduct`.
 */
export async function findProductBySku(stripe, sku) {
  assertValidSku(sku);
  const result = await stripe.products.search({
    query: `active:'true' AND metadata['sku']:'${sku}'`,
    limit: 1,
  });
  return result.data[0] ?? null;
}

export async function createProduct(stripe, { sku, name, description, unitAmount, currency }) {
  return stripe.products.create({
    name,
    ...(description ? { description } : {}),
    metadata: { sku },
    default_price_data: {
      currency,
      unit_amount: unitAmount,
    },
  });
}

async function resolveDefaultPrice(stripe, product, { currency, unitAmount }) {
  if (product.default_price) {
    return typeof product.default_price === "string"
      ? product.default_price
      : product.default_price.id;
  }
  const price = await stripe.prices.create({
    product: product.id,
    currency,
    unit_amount: unitAmount,
  });
  await stripe.products.update(product.id, { default_price: price.id });
  return price.id;
}

function toEntry(sku, product, priceId, { unitAmount, currency }) {
  return {
    sku,
    name: product.name,
    product_id: product.id,
    price_id: priceId,
    unit_amount: unitAmount,
    currency,
    livemode: product.livemode === true,
  };
}

/**
 * Creates the Stripe product and its default price for a shop SKU, or reuses
 * the ones that already exist, and records the identifiers in the datastore.
 */
export async function onboardProduct(stripe, dataDir, { sku, name, description, unitAmount, currency }) {
  assertValidSku(sku);
  const existing = await readCatalogEntry(dataDir, sku);
  if (existing) {
    return { entry: existing, created: false, reason: "already in the local catalog" };
  }

  const found = await findProductBySku(stripe, sku);
  if (found) {
    const priceId = await resolveDefaultPrice(stripe, found, { currency, unitAmount });
    const price = await stripe.prices.retrieve(priceId);
    const entry = await saveCatalogEntry(
      dataDir,
      toEntry(sku, found, priceId, {
        unitAmount: price.unit_amount,
        currency: price.currency,
      }),
    );
    return { entry, created: false, reason: "already exists in Stripe" };
  }

  const product = await createProduct(stripe, { sku, name, description, unitAmount, currency });
  const priceId = await resolveDefaultPrice(stripe, product, { currency, unitAmount });
  const entry = await saveCatalogEntry(dataDir, toEntry(sku, product, priceId, { unitAmount, currency }));
  return { entry, created: true, reason: "created in Stripe" };
}
