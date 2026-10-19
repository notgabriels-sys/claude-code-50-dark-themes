import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  FAMILY_PICKS,
  QUICK_PICKS_END,
  QUICK_PICKS_PACK,
  QUICK_PICKS_START,
  buildQuickPicks,
  computeQuickPicks,
  placeQuickPicks,
} from "./build-quick-picks.mjs";
import { buildThemePages, contrast, loadThemes } from "./build-theme-pages.mjs";

const root = new URL("../", import.meta.url);
const projectRoot = fileURLToPath(root);

async function makeFixture(t) {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "gabs-quick-picks-"));
  const fixtureRoot = join(temporaryRoot, "repo");
  await cp(projectRoot, fixtureRoot, {
    recursive: true,
    filter(source) {
      const pathFromRoot = relative(projectRoot, source);
      const isExcludedDirectory = [".git", ".worktrees", "node_modules"].some(
        (directory) => pathFromRoot === directory || pathFromRoot.startsWith(`${directory}${sep}`),
      );
      return !isExcludedDirectory;
    },
  });
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  return fixtureRoot;
}

async function runScript(script, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], { cwd });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

const textRatio = (theme) => contrast(theme.overrides.text, theme.terminal);
const accentRatio = (theme) => contrast(theme.overrides.claude, theme.terminal);

test("picks five distinct themes from the fifty by the stated measurements, the same way every run", async () => {
  const themes = await loadThemes(root);
  const first = computeQuickPicks(themes);
  const second = computeQuickPicks(themes);
  const summary = (picks) => picks.map((pick) => [pick.key, pick.theme.slug, pick.fact]);
  assert.deepEqual(summary(first), summary(second));

  assert.equal(first.length, 2 + FAMILY_PICKS.length);
  const slugs = first.map((pick) => pick.theme.slug);
  assert.equal(new Set(slugs).size, slugs.length, "no theme holds two picks");
  for (const pick of first) assert.equal(pick.theme.pack.id, QUICK_PICKS_PACK, `${pick.theme.name} is one of the fifty`);

  const fifty = themes.filter((theme) => theme.pack.id === QUICK_PICKS_PACK);
  assert.equal(fifty.length, 50);
  const [maximum, softest, ...families] = first;
  assert.equal(maximum.key, "maximum-contrast");
  for (const theme of fifty) {
    assert.ok(textRatio(maximum.theme) >= textRatio(theme), `${maximum.theme.name}'s text reads at least as strongly as ${theme.name}'s`);
  }
  assert.equal(softest.key, "long-sessions");
  for (const theme of fifty) {
    assert.ok(textRatio(softest.theme) <= textRatio(theme), `${softest.theme.name}'s text is no stronger than ${theme.name}'s`);
  }
  assert.ok(textRatio(softest.theme) >= 7, "the softest pick still clears the 7:1 floor its caption cites");

  const taken = new Set([maximum.theme.slug, softest.theme.slug]);
  families.forEach((pick, index) => {
    const [family, kicker] = FAMILY_PICKS[index];
    assert.equal(pick.key, family);
    assert.equal(pick.kicker, kicker);
    assert.equal(pick.theme.family, family, `${pick.theme.name} belongs to the ${family} family it stands for`);
    for (const theme of fifty) {
      if (theme.family !== family || taken.has(theme.slug)) continue;
      assert.ok(accentRatio(pick.theme) >= accentRatio(theme), `${pick.theme.name}'s accent is at least as strong as ${theme.name}'s`);
    }
    taken.add(pick.theme.slug);
  });
});

test("prints each ratio truncated to two decimals, never above the measurement, against the pick's own terminal", async () => {
  const picks = computeQuickPicks(await loadThemes(root));
  for (const pick of picks) {
    const measured = pick.key === "maximum-contrast" || pick.key === "long-sessions" ? pick.text : pick.accent;
    const printed = pick.fact.match(/^(?:Primary text|Accent) (\d+\.\d\d):1 on (#[0-9A-F]{6}), /);
    assert.ok(printed, `"${pick.fact}" opens with a ratio and the background it was measured on`);
    assert.equal(Number(printed[1]), Math.floor(measured * 100) / 100, `${pick.theme.name}: printed figure is the truncated measurement`);
    assert.ok(Number(printed[1]) <= measured);
    assert.equal(printed[2], pick.theme.terminal);
  }
});

test("says when a family's strongest accent already holds a pick above, and refuses a family with none left", () => {
  const make = (name, family, text, claude, pack = QUICK_PICKS_PACK) => ({
    name,
    slug: name.toLowerCase(),
    family,
    terminal: "#000000",
    pack: { id: pack },
    overrides: { text, claude, inactive: "#888888" },
  });
  const themes = [
    make("Alpha", "warm", "#FFFFFF", "#FFFFFF"), // strongest text, and the strongest warm accent
    make("Bravo", "warm", "#DDDDDD", "#DDDDDD"),
    make("Charlie", "neutral", "#CCCCCC", "#CCCCCC"), // softest text, and the strongest neutral accent
    make("Delta", "neutral", "#DDDDDD", "#BBBBBB"),
    make("Echo", "cool", "#EEEEEE", "#EEEEEE"),
    make("Foxtrot", "cool", "#EEEEEE", "#FFFFFF", "dark-themes-vol-2"), // another pack: never a pick
  ];
  const picks = computeQuickPicks(themes);
  assert.deepEqual(
    picks.map((pick) => [pick.key, pick.theme.name]),
    [
      ["maximum-contrast", "Alpha"],
      ["long-sessions", "Charlie"],
      ["neutral", "Delta"],
      ["warm", "Bravo"],
      ["cool", "Echo"],
    ],
  );
  assert.match(picks[2].fact, /the strongest of the 2 neutral accents after Charlie above\.$/);
  assert.match(picks[3].fact, /the strongest of the 2 warm accents after Alpha above\.$/);
  assert.match(picks[4].fact, /the only cool accent\.$/);
  assert.match(picks[0].fact, /the highest of all 5\.$/);
  assert.match(picks[1].fact, /the softest of all 5 and still above the 7:1 AAA floor\.$/);

  assert.throws(
    () => computeQuickPicks(themes.filter((theme) => theme.name !== "Delta")),
    /Every neutral theme already holds a pick/,
  );
  assert.throws(() => computeQuickPicks(themes.filter((theme) => theme.family !== "cool")), /No cool theme/);
});

test("renders the block verify.mjs expects: both markers, one link per pick, each to a rendered theme page", async () => {
  const block = await buildQuickPicks(root);
  assert.ok(block.startsWith(QUICK_PICKS_START));
  assert.ok(block.endsWith(QUICK_PICKS_END));
  assert.equal(await buildQuickPicks(root), block, "renders the same block twice");
  const links = [...block.matchAll(/href="\/theme\/([a-z0-9-]+)\/"/g)].map(([, slug]) => slug);
  assert.equal(links.length, 2 + FAMILY_PICKS.length);
  assert.equal((block.match(/class="pick"/g) ?? []).length, links.length);
  const pages = await buildThemePages(root);
  for (const slug of links) assert.ok(pages.has(`theme/${slug}/index.html`), `/theme/${slug}/ has a page`);
  assert.match(block, /Five of the 50, chosen by contrast measured/);
});

test("placeQuickPicks swaps only the block and refuses a page without the markers", () => {
  const before = `<p>before</p>\n    ${QUICK_PICKS_START}\n    old\n    ${QUICK_PICKS_END}\n<p>after</p>`;
  const block = `${QUICK_PICKS_START}\n    new\n    ${QUICK_PICKS_END}`;
  assert.equal(placeQuickPicks(before, block), `<p>before</p>\n    ${block}\n<p>after</p>`);
  assert.equal(placeQuickPicks(placeQuickPicks(before, block), block), placeQuickPicks(before, block), "placing twice changes nothing more");
  assert.throws(() => placeQuickPicks("<p>no markers</p>", block), /has no <!-- quick-picks:start -->/);
  assert.throws(() => placeQuickPicks(`<p>${QUICK_PICKS_START} only</p>`, block), /has no <!-- quick-picks:start -->/);
});

test("the command line rewrites a stale block in index.html so the verifier passes again", { timeout: 180_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const target = join(fixtureRoot, "index.html");
  const html = await readFile(target, "utf8");
  assert.ok(html.includes("the highest of all 50."), "the fixture carries the rendered row");
  await writeFile(target, html.replace("the highest of all 50.", "the highest of all 49."));

  const verifyBefore = await runScript("scripts/verify.mjs", fixtureRoot);
  assert.notEqual(verifyBefore.code, 0, "the verifier accepted a quick pick stating a count the builder does not");
  assert.match(verifyBefore.stderr, /The quick picks in index\.html are stale/);

  const build = await runScript("scripts/build-quick-picks.mjs", fixtureRoot);
  assert.equal(build.code, 0, build.stderr);
  assert.match(build.stdout, /Wrote 5 quick picks into index\.html\./);
  assert.equal(await readFile(target, "utf8"), html, "the builder restores exactly the committed block");

  const verifyAfter = await runScript("scripts/verify.mjs", fixtureRoot);
  assert.equal(verifyAfter.code, 0, verifyAfter.stderr);
});

test("rejects a storefront without the quick-picks block", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const page = join(fixtureRoot, "index.html");
  const html = await readFile(page, "utf8");
  const block = html.match(/ *<!-- quick-picks:start -->[\s\S]*?<!-- quick-picks:end -->\n/);
  assert.ok(block, "the storefront carries the quick-picks block");
  await writeFile(page, html.replace(block[0], ""));

  const result = await runScript("scripts/verify.mjs", fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted a storefront that dropped the quick picks");
  assert.match(result.stderr, /index\.html has no quick-picks block/);
});

test("rejects a storefront carrying the quick-picks row twice", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const page = join(fixtureRoot, "index.html");
  const html = await readFile(page, "utf8");
  const block = html.match(/ *<!-- quick-picks:start -->[\s\S]*?<!-- quick-picks:end -->\n/);
  assert.ok(block, "the storefront carries the quick-picks block");
  await writeFile(page, html.replace(block[0], block[0] + block[0]));

  const result = await runScript("scripts/verify.mjs", fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted two quick-picks rows");
  assert.match(result.stderr, /more than one quick-picks block/);
});

test("rejects a storefront whose quick pick names a figure the theme files do not give", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const page = join(fixtureRoot, "index.html");
  const html = await readFile(page, "utf8");
  const figure = html.match(/<span class="pick-fact">Primary text (\d+\.\d\d):1/);
  assert.ok(figure, "the first pick states a primary-text ratio");
  await writeFile(page, html.replace(`Primary text ${figure[1]}:1`, "Primary text 21.00:1"));

  const result = await runScript("scripts/verify.mjs", fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted a quick pick with an inflated ratio");
  assert.match(result.stderr, /The quick picks in index\.html are stale/);
});
