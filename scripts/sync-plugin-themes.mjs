import { copyFile, mkdir, readdir, rm } from "node:fs/promises";

import { isThemeFile } from "./build-theme-index.mjs";

const root = new URL("../", import.meta.url);
const destination = new URL("../plugins/50-dark-themes/themes/", import.meta.url);

await mkdir(destination, { recursive: true });
// A name from disk as a URL, each segment encoded: passed raw, a "#" or "?"
// cuts the name short and a "%2e%2e" segment reads as "..".
const fileUrl = (path, base) => new URL(path.split("/").map(encodeURIComponent).join("/"), base);

// isThemeFile, not a bare .json glob: themes.json is the published index and
// must never be copied into the plugin as a 51st theme.
const rootThemes = (await readdir(root)).filter(isThemeFile).sort();
const packagedThemes = (await readdir(destination))
  .filter((file) => file.endsWith(".json"));

for (const file of packagedThemes) {
  if (!rootThemes.includes(file)) await rm(fileUrl(file, destination));
}
for (const file of rootThemes) {
  await copyFile(fileUrl(file, root), fileUrl(file, destination));
}

console.log(`Synced ${rootThemes.length} themes into the Claude Code plugin.`);
