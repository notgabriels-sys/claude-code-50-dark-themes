import { copyFile, mkdir, readdir, rm } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const destination = new URL("../plugins/50-dark-themes/themes/", import.meta.url);

await mkdir(destination, { recursive: true });

const rootThemes = (await readdir(root))
  .filter((file) => file.endsWith(".json"))
  .sort();
const packagedThemes = (await readdir(destination))
  .filter((file) => file.endsWith(".json"));

for (const file of packagedThemes) {
  if (!rootThemes.includes(file)) await rm(new URL(file, destination));
}
for (const file of rootThemes) {
  await copyFile(new URL(file, root), new URL(file, destination));
}

console.log(`Synced ${rootThemes.length} themes into the Claude Code plugin.`);
