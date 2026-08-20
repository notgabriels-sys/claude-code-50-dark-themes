import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const packName = "Techno_Low_End_Architecture_by_Hologram_People";
const distRoot = join(root, "dist");
const archiveName = `${packName}.zip`;
const archivePath = join(distRoot, archiveName);

function sha256File(path) {
  return new Promise((resolveHash, rejectHash) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", rejectHash);
    stream.on("end", () => resolveHash(hash.digest("hex")));
  });
}

await rm(distRoot, { recursive: true, force: true });
await mkdir(distRoot, { recursive: true });
execFileSync("zip", ["-X", "-q", "-r", archivePath, packName], {
  cwd: join(root, "pack"),
  stdio: "inherit",
});

const sha256 = await sha256File(archivePath);
await writeFile(join(distRoot, "SHA256SUMS.txt"), `${sha256}  ${archiveName}\n`);
console.log(`${sha256}  ${archivePath}`);
