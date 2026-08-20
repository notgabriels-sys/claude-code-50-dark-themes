import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const temporaryDirectory = await mkdtemp(join(tmpdir(), "tlea-artwork-test-"));
const output = join(temporaryDirectory, "cover.png");

try {
  const render = spawnSync(
    "swift",
    [join(root, "artwork", "render-svg.swift"), join(root, "artwork", "cover.svg"), output, "1280", "720"],
    {
      encoding: "utf8",
      env: { ...process.env, CLANG_MODULE_CACHE_PATH: join(tmpdir(), "tlea-swift-module-cache") },
    },
  );
  assert.equal(render.status, 0, `renderer failed:\n${render.stdout}${render.stderr}`);
  const dimensions = execFileSync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", output], {
    encoding: "utf8",
  });
  assert.match(dimensions, /pixelWidth: 1280/);
  assert.match(dimensions, /pixelHeight: 720/);
  console.log("Artwork renderer preserves the requested SVG dimensions.");
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
