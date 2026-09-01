import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/**
 * Tiny JSON-file datastore. The service only needs to keep a handful of Stripe
 * identifiers next to the shop's own SKUs, so a file per collection is enough;
 * swap these two functions for real database calls when one exists.
 */
export function collectionPath(dataDir, collection) {
  return join(dataDir, `${collection}.json`);
}

export async function readCollection(dataDir, collection) {
  try {
    const source = await readFile(collectionPath(dataDir, collection), "utf8");
    const parsed = JSON.parse(source);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

export async function writeCollection(dataDir, collection, records) {
  const target = collectionPath(dataDir, collection);
  await mkdir(dirname(target), { recursive: true });
  const temporary = `${target}.tmp`;
  await writeFile(temporary, `${JSON.stringify(records, null, 2)}\n`, "utf8");
  await rename(temporary, target);
}

export async function updateCollection(dataDir, collection, mutate) {
  const records = await readCollection(dataDir, collection);
  const next = mutate(records) ?? records;
  await writeCollection(dataDir, collection, next);
  return next;
}
