// The smoke test (SPEC.md §17): loads the unpacked extension in Chromium and
// opens its pages, which the node tests can't reach. Tiling, workspaces and
// keys need ChromeOS's windows, so FakeChrome covers those instead.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const EXTENSION = fileURLToPath(new URL("..", import.meta.url));

let context;
let worker;
let base;

before(async () => {
  context = await chromium.launchPersistentContext("", {
    headless: false,
    args: ["--headless=new", `--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`],
  });
  worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
  base = new URL(".", worker.url()).href.replace(/src\/$/, "");
});

after(async () => {
  await context?.close();
});

// Opens one of the extension's pages, failing on any error it throws.
async function open(path) {
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + path);
  return { page, errors };
}

test("the background worker starts", async () => {
  assert.match(worker.url(), /^chrome-extension:\/\/[a-p]{32}\//);
  // It answers once its module has loaded and its listeners are in place.
  assert.equal(await worker.evaluate(() => typeof chrome.commands.onCommand.hasListeners), "function");
  assert.equal(await worker.evaluate(() => chrome.commands.onCommand.hasListeners()), true);
});

test("the options page renders every section and saves changes", async () => {
  const { page, errors } = await open("src/options.html");
  await page.waitForSelector("#setup li");
  const headings = await page.locator("h2").allInnerTexts();
  for (const h of ["Clocks", "Setup checklist", "Keys", "Apps", "Attention", "Dim", "Workspaces", "Layouts on this Chromebook", "Mouse on this Chromebook", "Import and export"]) {
    assert.ok(headings.includes(h), `no ${h} section in ${headings}`);
  }
  assert.ok((await page.locator("#clocks tbody tr").count()) > 0, "no clocks");
  assert.ok((await page.locator("#keys tbody tr").count()) > 0, "no keys");
  assert.ok((await page.locator("#modes tbody tr").count()) > 0, "no layouts");

  await page.locator("#dim-strength").fill("20");
  await page.locator("#dim-strength").dispatchEvent("change");
  await page.waitForFunction(async () => (await chrome.storage.sync.get("settings")).settings?.dimStrength === 0.2);

  await page.locator("#wheel-step").fill("200");
  await page.locator("#wheel-step").dispatchEvent("change");
  await page.waitForFunction(async () => (await chrome.storage.local.get("settings")).settings?.wheelStep === 200);

  await page.locator("#setup input[type=checkbox]").first().check();
  await page.waitForFunction(async () => ((await chrome.storage.local.get("setup")).setup ?? []).length === 1);

  assert.deepEqual(errors, []);
  assert.equal(await page.locator("#errors").isHidden(), true, await page.locator("#errors").innerText());
});

test("the settings open pages in their own window", async () => {
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.opened = [];
    chrome.tabs.create = async (props) => window.opened.push(props);
  });
  await page.goto(base + "src/options.html");
  await page.waitForSelector("#setup li button");
  await page.locator("#setup li button").first().click();
  await page.locator("#open-shortcuts").click();
  await page.waitForFunction(() => window.opened.length === 2);
  const here = await page.evaluate(async () => (await chrome.windows.getCurrent()).id);
  for (const o of await page.evaluate(() => window.opened)) assert.equal(o.windowId, here, o.url);
});

for (const mode of ["home", "dashboard"]) {
  test(`the ${mode} page renders the bar, clocks and launcher`, async () => {
    const { page, errors } = await open(`src/launcher.html?mode=${mode}`);
    await page.waitForSelector("#clocks li");
    assert.ok(await page.locator("#query").isVisible(), "no launcher");
    if (mode === "dashboard") await page.locator("#clocks").click();
    await page.waitForSelector(".calendar .days");
    const month = await page.locator(".calendar .month strong").innerText();
    await page.locator('[aria-label="Next month"]').click();
    assert.notEqual(await page.locator(".calendar .month strong").innerText(), month, "the calendar didn't step");
    assert.deepEqual(errors, []);
  });
}

test("the dashboard stays open while Chrome asks for the dim's access", async () => {
  const { page, errors } = await open("src/launcher.html?mode=dashboard");
  await page.waitForSelector("#clocks li");
  // Hold the prompt open, and record closes rather than closing.
  await page.evaluate(() => {
    window.answer = null;
    chrome.permissions.request = () => new Promise((resolve) => (window.answer = resolve));
    window.closes = 0;
    window.close = () => window.closes++;
  });
  await page.locator("#dim").click();
  await page.waitForFunction(() => window.answer !== null);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  assert.equal(await page.evaluate(() => window.closes), 0, "closed under the prompt");
  await page.evaluate(() => window.answer(false));
  await page.waitForFunction(() => !document.getElementById("dim").checked);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  assert.equal(await page.evaluate(() => window.closes), 1, "didn't close once answered");
  assert.deepEqual(errors, []);
});

test("clocks on another day line up with the rest", async () => {
  // A day apart in all, so whatever the time, one is on another day.
  const clocks = [
    { zone: "Pacific/Kiritimati", label: "KIR", city: "Kiritimati" },
    { zone: "Pacific/Pago_Pago", label: "PPG", city: "Pago Pago" },
    { zone: "Europe/London", label: "LON", city: "London" },
    { zone: "Asia/Tokyo", label: "TYO", city: "Tokyo" },
  ];
  await worker.evaluate((clocks) => chrome.storage.sync.set({ settings: { clocks } }), clocks);
  try {
    const { page, errors } = await open("src/launcher.html?mode=dashboard");
    await page.waitForSelector("#clocks sup");
    const bottoms = await page.locator("#clocks .label").evaluateAll((labels) => labels.map((l) => l.getBoundingClientRect().bottom));
    assert.ok(bottoms.length >= clocks.length, `${bottoms.length} clocks`);
    assert.ok(Math.max(...bottoms) - Math.min(...bottoms) < 1, `labels at ${bottoms}`);
    assert.deepEqual(errors, []);
  } finally {
    await worker.evaluate(() => chrome.storage.sync.remove("settings"));
  }
});

test("the mouse page fills the mouse's ID into the crosh lines", async () => {
  await worker.evaluate(() => chrome.storage.local.set({ settings: { wheelStep: 200 }, mouseId: 7 }));
  try {
    const { page, errors } = await open("src/mouse.html");
    await page.waitForFunction(() => document.getElementById("line-1").textContent.includes("200"));
    assert.equal(await page.locator("#mouse-id").inputValue(), "7", "the last ID isn't offered");
    assert.equal(await page.locator("#line-1").innerText(), 'gesture_prop set 7 "Mouse Scroll Accel Curve" array:double:200,0,0,0,0');
    await page.locator("#mouse-id").fill("12");
    await page.locator("#mouse-id").dispatchEvent("change");
    assert.match(await page.locator("#line-0").innerText(), /^gesture_prop set 12 "Mouse High Resolution Scrolling"/);
    await page.waitForFunction(async () => (await chrome.storage.local.get("mouseId")).mouseId === 12);
    // A step changed on the options page reaches the open page.
    await worker.evaluate(() => chrome.storage.local.set({ settings: { wheelStep: 300 } }));
    await page.waitForFunction(() => document.getElementById("line-1").textContent.includes("array:double:300,"));
    assert.deepEqual(errors, []);
    assert.equal(await page.locator("#errors").isHidden(), true, await page.locator("#errors").innerText());
  } finally {
    await worker.evaluate(() => chrome.storage.local.remove(["settings", "mouseId"]));
  }
});
