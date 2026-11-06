// Real-browser checks run on the Ubuntu CI runner. Install Playwright outside
// the checkout and pass its absolute index.mjs path in PLAYWRIGHT_MODULE.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const modulePath = process.env.PLAYWRIGHT_MODULE;
assert.ok(modulePath && isAbsolute(modulePath), "PLAYWRIGHT_MODULE must be an absolute path");
const { chromium } = await import(pathToFileURL(modulePath).href);
const candidateUrl = process.env.FAMILIARS_URL ?? "http://127.0.0.1:4173/familiars.html";
const baselineUrl = process.env.FAMILIARS_BASELINE_URL;
const output = resolve(process.env.FAMILIARS_ARTIFACTS ?? `${tmpdir()}/familiars-browser-artifacts`);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
let failures = 0;

// Instrument native scheduling without replacing the app's behavior. The
// counters catch an eye loop or blink timer left alive after pausing motion.
function observePage({ savedTheme, denyStorage } = {}) {
  if (denyStorage) {
    Object.defineProperty(window, "localStorage", {
      get() { throw new DOMException("Storage denied for browser check", "SecurityError"); },
    });
  } else if (savedTheme) {
    localStorage.setItem("familiars-theme", savedTheme);
  }
  window.__themeBoot = [];
  new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "attributes" && record.attributeName === "data-theme") {
        window.__themeBoot.push("theme");
      }
      for (const node of record.addedNodes) {
        if (node.nodeType === 1 && node.matches("style, link[rel=stylesheet]")) {
          window.__themeBoot.push("style");
        }
      }
    }
  }).observe(document, { childList: true, attributes: true, subtree: true, attributeFilter: ["data-theme"] });
  const frames = new Set(), timers = new Set();
  const raf = window.requestAnimationFrame.bind(window), caf = window.cancelAnimationFrame.bind(window);
  const timeout = window.setTimeout.bind(window), clear = window.clearTimeout.bind(window);
  let callbacks = 0, maxFrames = 0, maxTimers = 0;
  window.requestAnimationFrame = (callback) => {
    const id = raf((time) => { frames.delete(id); callbacks++; callback(time); });
    frames.add(id); maxFrames = Math.max(maxFrames, frames.size); return id;
  };
  window.cancelAnimationFrame = (id) => { frames.delete(id); caf(id); };
  window.setTimeout = (callback, delay, ...args) => {
    if (typeof callback !== "function") return timeout(callback, delay, ...args);
    const id = timeout(() => { timers.delete(id); callback(...args); }, delay);
    timers.add(id); maxTimers = Math.max(maxTimers, timers.size); return id;
  };
  window.clearTimeout = (id) => { timers.delete(id); clear(id); };
  window.__motionStats = () => ({ frames: frames.size, timers: timers.size, callbacks, maxFrames, maxTimers });
}

async function open(context, url = candidateUrl) {
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  const response = await page.goto(url, { waitUntil: "networkidle" });
  assert.equal(response?.status(), 200, `HTTP page must be available: ${url}`);
  await page.evaluate(() => document.fonts.ready);
  return page;
}

async function checkRequests(page) {
  assert.equal(await page.locator(".card").count(), 7, "catalogue must contain seven cards");
  for (const name of ["Latch", "Loom", "Witness", "Ledger", "Echo", "Den"]) {
    const card = page.locator(".card").filter({ has: page.getByRole("heading", { name, exact: true }) });
    const request = card.getByRole("link", { name: `Request ${name}`, exact: true });
    assert.equal(await request.count(), 1, `${name} needs a named request link`);
    assert.ok(await request.isVisible(), `${name} request link must be visible`);
    const target = new URL(await request.getAttribute("href"));
    assert.equal(target.protocol, "mailto:");
    assert.equal(target.pathname, "notgabriels@gmail.com");
    assert.equal(target.searchParams.get("subject"), `Familiars early access: ${name}`);
    assert.ok(target.searchParams.get("body")?.includes(name), `${name} email must retain the selected familiar`);
  }
}

async function motionIsStopped(page) {
  await page.locator(".card").first().hover();
  await page.mouse.move(30, 30);
  await page.waitForTimeout(180);
  const before = await page.evaluate(() => ({
    eye: [document.getElementById("eye").getAttribute("x"), document.getElementById("eye").getAttribute("y")],
    ...window.__motionStats(),
  }));
  await page.mouse.move(850, 600);
  await page.locator(".card").first().hover();
  await page.waitForTimeout(180);
  const after = await page.evaluate(() => ({
    eye: [document.getElementById("eye").getAttribute("x"), document.getElementById("eye").getAttribute("y")],
    ...window.__motionStats(),
    running: document.getAnimations().filter((animation) => animation.playState === "running").length,
    hoverTransform: getComputedStyle(document.querySelector(".card:hover") ?? document.querySelector(".card")).transform,
  }));
  assert.deepEqual(after.eye, before.eye, "eye must rest when motion is disabled");
  assert.equal(after.callbacks, before.callbacks, "paused eye must not keep requesting frames");
  assert.equal(after.frames, 0, "disabled eye must cancel its scheduled frame");
  assert.equal(after.timers, 0, "disabled eye must cancel its blink timer");
  assert.equal(after.running, 0, "motion-disabled page must have no running CSS animation or transition");
  assert.equal(after.hoverTransform, "none", "motion-disabled hover must not move cards");
}

async function check(name, run, options = {}) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 }, colorScheme: "dark", reducedMotion: "no-preference", ...options,
  });
  const errors = [];
  context.on("page", (page) => {
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  });
  try {
    await run(context);
    assert.deepEqual(errors, [], "page must have no JavaScript or console errors");
    results.push({ name, status: "passed" });
    console.log(`PASS ${name}`);
  } catch (error) {
    failures++;
    results.push({ name, status: "failed", error: error.stack, pageErrors: errors });
    console.error(`FAIL ${name}\n${error.stack}`);
    const page = context.pages()[0];
    if (page) await page.screenshot({ path: resolve(output, `failure-${name.replace(/[^a-z0-9]+/gi, "-")}.png`), fullPage: true }).catch(() => {});
  } finally {
    await context.close();
  }
}

try {
  if (baselineUrl) {
    await check("historical baseline proves selected regressions", async (context) => {
      const page = await open(context, baselineUrl);
      for (const [name, assertion] of [
        ["card request action", () => checkRequests(page)],
        ["motion pause control", async () => assert.equal(await page.getByRole("button", { name: "Pause motion", exact: true }).count(), 1)],
      ]) {
        let observed;
        try { await assertion(); } catch (error) { observed = error; }
        assert.equal(observed?.code, "ERR_ASSERTION", `${name}: the original snapshot must fail a behavior assertion, not infrastructure`);
        results.push({ name: `baseline: ${name}`, status: "expected failure", error: observed.message });
        console.log(`EXPECTED BASELINE FAILURE ${name}: ${observed.message}`);
      }
    });
  }

  await check("catalogue filters and named request actions", async (context) => {
    const page = await open(context);
    await checkRequests(page);
    for (const [label, count] of [["Skills", 5], ["Plugins", 1], ["Themes", 1], ["All", 7]]) {
      const button = page.getByRole("button", { name: label, exact: true });
      await button.click();
      assert.equal(await button.getAttribute("aria-pressed"), "true");
      assert.equal(await page.locator(".card:visible").count(), count, `${label} filter count`);
      assert.match(await page.locator("#catalogue-status").textContent(), new RegExp(`\\b${count}\\b`));
      assert.equal(await page.locator('.filters [aria-pressed="true"]').count(), 1);
    }
  });

  await check("theme action name and persistence", async (context) => {
    await context.addInitScript(observePage);
    const page = await open(context);
    await page.getByRole("button", { name: "Light mode", exact: true }).click();
    assert.equal(await page.locator("html").getAttribute("data-theme"), "light");
    assert.equal(await page.getByRole("button", { name: "Dark mode", exact: true }).count(), 1);
    await page.reload({ waitUntil: "networkidle" });
    assert.equal(await page.locator("html").getAttribute("data-theme"), "light");
    const order = await page.evaluate(() => window.__themeBoot);
    assert.ok(order.indexOf("theme") >= 0 && order.indexOf("theme") < order.indexOf("style"), "saved theme must be applied before the first stylesheet");
    await page.getByRole("button", { name: "Dark mode", exact: true }).click();
    assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  });

  await check("saved dark theme overrides a light system before styling", async (context) => {
    await context.addInitScript(observePage, { savedTheme: "dark" });
    const page = await open(context);
    assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
    assert.equal(await page.getByRole("button", { name: "Light mode", exact: true }).count(), 1);
    const order = await page.evaluate(() => window.__themeBoot);
    assert.ok(order.indexOf("theme") >= 0 && order.indexOf("theme") < order.indexOf("style"));
  }, { colorScheme: "light" });

  await check("light refusal labels retain readable contrast", async (context) => {
    const page = await open(context);
    const ratios = await page.locator(".refuses .k").evaluateAll((labels) => {
      function luminance(color) {
        const channels = color.match(/[\d.]+/g).slice(0, 3).map(Number).map((value) => {
          const channel = value / 255;
          return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
        });
        return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
      }
      return labels.map((label) => {
        const foreground = luminance(getComputedStyle(label).color);
        const background = luminance(getComputedStyle(label.closest(".card")).backgroundColor);
        return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
      });
    });
    assert.equal(ratios.length, 7);
    assert.ok(ratios.every((ratio) => ratio >= 4.5), `small refusal labels need 4.5:1 contrast: ${ratios.join(", ")}`);
  }, { colorScheme: "light" });

  await check("blocked local storage leaves controls functional", async (context) => {
    await context.addInitScript(observePage, { denyStorage: true });
    const page = await open(context);
    await page.getByRole("button", { name: "Light mode", exact: true }).click();
    assert.equal(await page.getByRole("button", { name: "Dark mode", exact: true }).count(), 1);
    await page.getByRole("button", { name: "Pause motion", exact: true }).click();
    assert.equal(await page.locator("html").getAttribute("data-motion"), "paused");
    await page.getByRole("button", { name: "Skills", exact: true }).click();
    assert.equal(await page.locator(".card:visible").count(), 5);
  });

  await check("clipboard writes the address and rejects with a useful fallback", async (context) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const page = await open(context);
    await page.getByRole("button", { name: "Copy address", exact: true }).click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "notgabriels@gmail.com");
    assert.match(await page.locator("#copied").textContent(), /Copied/i);
    // Only the external clipboard boundary is denied; the real fallback runs.
    await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined }));
    await page.getByRole("button", { name: "Copy address", exact: true }).click();
    assert.equal(await page.evaluate(() => getSelection().toString()), "notgabriels@gmail.com");
    assert.match(await page.locator("#copied").textContent(), /copy/i);
  });

  await check("pause persists and resumes only one eye loop", async (context) => {
    await context.addInitScript(observePage);
    const page = await open(context);
    assert.equal(await page.locator("html").getAttribute("data-motion"), "running");
    for (let cycle = 0; cycle < 3; cycle++) {
      await page.getByRole("button", { name: "Pause motion", exact: true }).click();
      assert.equal(await page.locator("html").getAttribute("data-motion"), "paused");
      await motionIsStopped(page);
      if (cycle === 0) {
        await page.reload({ waitUntil: "networkidle" });
        assert.equal(await page.locator("html").getAttribute("data-motion"), "paused");
        await motionIsStopped(page);
      }
      await page.getByRole("button", { name: "Play motion", exact: true }).click();
      assert.equal(await page.locator("html").getAttribute("data-motion"), "running");
      await page.waitForTimeout(100);
      const stats = await page.evaluate(() => window.__motionStats());
      assert.equal(stats.frames, 1, "running eye should schedule one frame");
      assert.equal(stats.timers, 1, "running eye should schedule one blink");
      assert.ok(stats.maxFrames <= 1 && stats.maxTimers <= 1, "resuming must not duplicate loops");
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.waitForTimeout(100);
    assert.ok(!(await page.locator("#motion").isVisible()), "OS reduced motion must hide the play control");
    await motionIsStopped(page);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.waitForTimeout(100);
    assert.ok(await page.getByRole("button", { name: "Pause motion", exact: true }).isVisible());
    assert.equal((await page.evaluate(() => window.__motionStats())).frames, 1);
  });

  await check("OS reduced motion starts with a stationary page", async (context) => {
    await context.addInitScript(observePage);
    const page = await open(context);
    assert.ok(!(await page.locator("#motion").isVisible()));
    await motionIsStopped(page);
  }, { reducedMotion: "reduce" });

  await check("JavaScript disabled preserves requests and hides inactive controls", async (context) => {
    const page = await open(context);
    await checkRequests(page);
    assert.equal(await page.locator(".card:visible").count(), 7);
    for (const selector of [".filters", "#theme", "#copy", "#motion"]) {
      assert.ok(!(await page.locator(selector).isVisible()), `${selector} should not offer an inactive control`);
    }
    assert.equal(await page.locator(".card:visible").count(), 7);
    assert.equal(await page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === "running").length), 0);
  }, { javaScriptEnabled: false });

  for (const [width, height] of [[320, 740], [390, 844], [1280, 900]]) {
    await check(`layout and keyboard focus at ${width}px`, async (context) => {
      const page = await open(context);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.body.scrollWidth <= innerWidth), "page must not overflow horizontally");
      const clipped = await page.locator("a[href], button").evaluateAll((elements) => elements
        .filter((element) => element.getClientRects().length && getComputedStyle(element).visibility !== "hidden")
        .map((element) => ({ text: element.textContent.trim(), bounds: element.getBoundingClientRect().toJSON() }))
        .filter(({ bounds }) => bounds.left < -0.5 || bounds.right > innerWidth + 0.5));
      assert.deepEqual(clipped, [], "actionable elements must fit horizontally, including when the page clips overflow");
      const controls = await page.locator('a[href], button:not([hidden])').count();
      for (let step = 0; step < controls + 2; step++) {
        await page.keyboard.press("Tab");
        await page.waitForTimeout(35);
        const covered = await page.evaluate(() => {
          const active = document.activeElement, theme = document.getElementById("theme");
          if (!active || active === document.body || active === theme || !theme || theme.hidden) return null;
          const a = active.getBoundingClientRect(), b = theme.getBoundingClientRect();
          if (a.top < -0.5 || a.bottom > innerHeight + 0.5 || a.left < -0.5 || a.right > innerWidth + 0.5) {
            return { text: active.textContent.trim(), clipped: a.toJSON() };
          }
          const intersects = a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
          return intersects ? { text: active.textContent.trim(), active: a.toJSON(), theme: b.toJSON() } : null;
        });
        assert.equal(covered, null, `keyboard focus must not be covered by the theme control: ${JSON.stringify(covered)}`);
      }
    }, { viewport: { width, height } });
  }

  for (const [name, colorScheme, viewport] of [
    ["desktop-dark", "dark", { width: 1280, height: 900 }],
    ["desktop-light", "light", { width: 1280, height: 900 }],
    ["mobile-dark", "dark", { width: 390, height: 844 }],
  ]) {
    await check(`screenshot ${name}`, async (context) => {
      const page = await open(context);
      await page.screenshot({ path: resolve(output, `${name}.png`), fullPage: true, animations: "disabled" });
    }, { colorScheme, viewport });
  }
} finally {
  await browser.close();
  await writeFile(resolve(output, "report.json"), `${JSON.stringify({ candidateUrl, baselineUrl, results, failures }, null, 2)}\n`);
}
if (failures) process.exitCode = 1;
