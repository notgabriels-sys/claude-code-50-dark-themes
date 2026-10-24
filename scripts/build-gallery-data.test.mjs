import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

import {
  GALLERY_DATA_PATH,
  GALLERY_FAMILIES,
  GALLERY_PACKS,
  buildGalleryData,
  loadGalleryThemes,
  renderGalleryData,
} from "./build-gallery-data.mjs";

const root = new URL("../", import.meta.url);
const projectRoot = fileURLToPath(root);
const script = join(projectRoot, "scripts", "build-gallery-data.mjs");

const themeFiles = async (dir) => (await readdir(new URL(dir || "./", root))).filter((file) => file.endsWith(".json")).sort();

// Only what the builder reads, so a fixture never copies the whole site.
async function makeFixture(t) {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "gabs-gallery-data-"));
  const fixtureRoot = join(temporaryRoot, "repo");
  await mkdir(join(fixtureRoot, "plugins", "theme-gallery", "hooks"), { recursive: true });
  await mkdir(join(fixtureRoot, "plugins", "dark-themes-vol-2"), { recursive: true });
  await cp(join(projectRoot, "scripts"), join(fixtureRoot, "scripts"), { recursive: true });
  await cp(join(projectRoot, "plugins", "dark-themes-vol-2", "themes"), join(fixtureRoot, "plugins", "dark-themes-vol-2", "themes"), {
    recursive: true,
  });
  for (const file of await themeFiles("")) await cp(join(projectRoot, file), join(fixtureRoot, file));
  await cp(join(projectRoot, GALLERY_DATA_PATH), join(fixtureRoot, GALLERY_DATA_PATH));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  return fixtureRoot;
}

const check = (cwd) => spawnSync(process.execPath, [join(cwd, "scripts", "build-gallery-data.mjs"), "--check"], { cwd, encoding: "utf8" });

test("the committed gallery data is exactly what the theme files render", async () => {
  const committed = await readFile(new URL(GALLERY_DATA_PATH, root), "utf8");
  assert.equal(committed, await buildGalleryData(root), `Run node scripts/build-gallery-data.mjs and commit ${GALLERY_DATA_PATH}.`);
  const result = spawnSync(process.execPath, [script, "--check"], { cwd: projectRoot, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
});

test("the gallery holds the 62 free themes and nothing else", async () => {
  const themes = await loadGalleryThemes(root);
  assert.equal(themes.length, 62);
  for (const pack of GALLERY_PACKS) {
    const files = await themeFiles(pack.dir);
    const slugs = themes.filter((theme) => theme.pack === pack.id).map((theme) => `${theme.slug}.json`);
    assert.deepEqual(slugs, files, `${pack.id} in the gallery must be exactly the files in ${pack.dir || "the repository root"}`);
  }
  assert.equal(themes.filter((theme) => theme.pack === "50-dark-themes").length, 50);
  assert.equal(themes.filter((theme) => theme.pack === "dark-themes-vol-2").length, 12);
  assert.deepEqual(
    GALLERY_PACKS.map((pack) => pack.id),
    ["50-dark-themes", "dark-themes-vol-2"],
    "only the two free packs may feed the gallery",
  );
});

test("every swatch is the colour its theme file holds", async () => {
  const themes = await loadGalleryThemes(root);
  for (const theme of themes) {
    const pack = GALLERY_PACKS.find((one) => one.id === theme.pack);
    const file = JSON.parse(await readFile(new URL(`${pack.dir}${theme.slug}.json`, root), "utf8"));
    assert.equal(theme.name, file.name);
    assert.equal(theme.accent, file.overrides.claude.toUpperCase(), `${theme.slug} accent`);
    assert.equal(theme.text, file.overrides.text.toUpperCase(), `${theme.slug} text`);
    assert.equal(theme.panel, file.overrides.userMessageBackground.toUpperCase(), `${theme.slug} panel`);
    assert.equal(theme.accent2, file.overrides.permission.toUpperCase(), `${theme.slug} second accent`);
    assert.ok(GALLERY_FAMILIES.includes(theme.family), `${theme.slug} family ${theme.family}`);
  }
});

test("the check fails when a theme file changes and the data is not rebuilt", { timeout: 60_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  assert.equal(check(fixtureRoot).status, 0, "a fresh fixture should pass");

  const path = join(fixtureRoot, "absinthe.json");
  const theme = JSON.parse(await readFile(path, "utf8"));
  theme.overrides.claude = "#123456";
  await writeFile(path, `${JSON.stringify(theme, null, 2)}\n`);
  const stale = check(fixtureRoot);
  assert.notEqual(stale.status, 0, "the check accepted gallery data that no longer matches absinthe.json");
  assert.match(stale.stderr, /out of date with the theme files/);

  const rebuilt = spawnSync(process.execPath, [join(fixtureRoot, "scripts", "build-gallery-data.mjs")], { cwd: fixtureRoot, encoding: "utf8" });
  assert.equal(rebuilt.status, 0, rebuilt.stderr);
  assert.equal(check(fixtureRoot).status, 0, "a rebuild should bring the data back in line");
  assert.match(await readFile(join(fixtureRoot, GALLERY_DATA_PATH), "utf8"), /slug: 'absinthe'.*accent: '#123456'/);
});

test("the check fails when a theme is added to a pack and the data is not rebuilt", { timeout: 60_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const source = JSON.parse(await readFile(join(fixtureRoot, "plugins", "dark-themes-vol-2", "themes", "ozone.json"), "utf8"));
  source.name = "Fixture Added";
  await writeFile(join(fixtureRoot, "plugins", "dark-themes-vol-2", "themes", "fixture-added.json"), JSON.stringify(source));
  const stale = check(fixtureRoot);
  assert.notEqual(stale.status, 0, "the check accepted gallery data missing a theme the pack ships");
});

test("the check fails when the data module is edited by hand", { timeout: 60_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const dataPath = join(fixtureRoot, GALLERY_DATA_PATH);
  const data = await readFile(dataPath, "utf8");
  await writeFile(
    dataPath,
    data.replace("]\n", "  { pack: 'dark-themes-vol-2', slug: 'hand-added', name: 'Hand Added', family: 'warm', accent: '#000000', text: '#000000', panel: '#000000', accent2: '#000000' },\n]\n"),
  );
  assert.notEqual(check(fixtureRoot).status, 0, "the check accepted a theme written into the data module by hand");
});

test("a theme whose file name is not its slug is refused", async (t) => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "gabs-gallery-slug-"));
  t.after(() => rm(fixtureRoot, { recursive: true, force: true }));
  const colours = { claude: "#000000", text: "#000000", userMessageBackground: "#000000", permission: "#000000" };
  await mkdir(join(fixtureRoot, "plugins", "dark-themes-vol-2", "themes"), { recursive: true });
  await writeFile(join(fixtureRoot, "x.json"), JSON.stringify({ name: "X", base: "dark", overrides: colours }));
  await writeFile(
    join(fixtureRoot, "plugins", "dark-themes-vol-2", "themes", "a.json"),
    JSON.stringify({ name: "B", base: "dark", overrides: colours }),
  );
  await assert.rejects(loadGalleryThemes(pathToFileURL(`${fixtureRoot}/`)), /file name does not match the slug/);
});

test("names are written as safe single-quoted literals", () => {
  const out = renderGalleryData([
    { pack: "50-dark-themes", slug: "it-s", name: "It's \\ odd", family: "warm", accent: "#000000", text: "#000000", panel: "#000000", accent2: "#000000" },
  ]);
  assert.match(out, /name: 'It\\'s \\\\ odd'/);
});
