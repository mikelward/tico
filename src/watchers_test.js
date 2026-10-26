import { test } from "node:test";
import assert from "node:assert/strict";
import { FakeChrome, HD } from "./fake_chrome.js";
import { DEFAULT_SETTINGS } from "./settings.js";
import { DEFAULT_SITES } from "./unread.js";
import { watchPatterns, isWatched, serialized, syncWatchers, WATCHER_ID } from "./watchers.js";

test("each site is registered once", () => {
  assert.deepEqual(watchPatterns(["https://mail.google.com", "https://app.slack.com", "https://mail.google.com"]), [
    "https://mail.google.com/*",
    "https://app.slack.com/*",
  ]);
});

test("Gmail, Chat and Calendar are the default sites, shown only once allowed", async () => {
  const chrome = new FakeChrome({ displays: [HD] });
  assert.deepEqual(DEFAULT_SETTINGS.watched, DEFAULT_SITES);
  assert.deepEqual(await syncWatchers(chrome, DEFAULT_SITES), []);
  assert.equal(chrome.registered.has(WATCHER_ID), false);
  for (const site of DEFAULT_SITES) chrome.grantedOrigins.add(`${site}/*`);
  const all = DEFAULT_SITES.map((site) => `${site}/*`);
  assert.deepEqual(await syncWatchers(chrome, DEFAULT_SITES), all);
  assert.deepEqual(chrome.registered.get(WATCHER_ID).matches, all);
});

test("only sites granted on this Chromebook are watched", async () => {
  const chrome = new FakeChrome({ displays: [HD] });
  chrome.grantedOrigins.add("https://app.slack.com/*");
  const watched = await syncWatchers(chrome, ["https://app.slack.com", "https://discord.com"]);
  assert.deepEqual(watched, ["https://app.slack.com/*"]);
  const script = chrome.registered.get(WATCHER_ID);
  assert.deepEqual(script.matches, ["https://app.slack.com/*"]);
  assert.deepEqual(script.js, ["src/unread_watch.js"]);
});

test("the watcher follows the settings and grants, and goes when none are left", async () => {
  const chrome = new FakeChrome({ displays: [HD] });
  chrome.grantedOrigins.add("https://app.slack.com/*");
  chrome.grantedOrigins.add("https://discord.com/*");
  await syncWatchers(chrome, ["https://app.slack.com"]);
  await syncWatchers(chrome, ["https://app.slack.com", "https://discord.com"]);
  assert.deepEqual(chrome.registered.get(WATCHER_ID).matches, ["https://app.slack.com/*", "https://discord.com/*"]);
  chrome.grantedOrigins.delete("https://app.slack.com/*");
  await syncWatchers(chrome, ["https://app.slack.com", "https://discord.com"]);
  assert.deepEqual(chrome.registered.get(WATCHER_ID).matches, ["https://discord.com/*"], "a revoked site goes");
  await syncWatchers(chrome, []);
  assert.equal(chrome.registered.has(WATCHER_ID), false);
});

test("a report counts only from a site the settings name now", () => {
  assert.equal(isWatched("https://mail.google.com/mail/u/0/#inbox", DEFAULT_SITES), true);
  assert.equal(isWatched("https://mail.google.com/mail/u/0/#inbox", []), false, "Gmail too, once removed");
  assert.equal(isWatched("https://app.slack.com/client/T1", ["https://app.slack.com"]), true);
  assert.equal(isWatched("https://app.slack.com/client/T1", []), false, "a removed site's open page is ignored");
  assert.equal(isWatched(undefined, ["https://app.slack.com"]), false);
});

test("serialized calls finish in the order they were made", async () => {
  const done = [];
  let release;
  const gate = new Promise((r) => (release = r));
  const run = serialized(async (name, wait) => {
    if (wait) await gate;
    done.push(name);
  });
  const old = run("old", true);
  const fresh = run("new", false);
  release();
  await Promise.all([old, fresh]);
  assert.deepEqual(done, ["old", "new"], "the newer call waits for the older one");
});

test("a failed call doesn't stop the next", async () => {
  const run = serialized(async (fail) => {
    if (fail) throw new Error("boom");
    return "ok";
  });
  await assert.rejects(run(true));
  assert.equal(await run(false), "ok");
});

test("pages already open on a newly watched site get the watcher now", async () => {
  const chrome = new FakeChrome({
    displays: [HD],
    windows: [
      { id: 1, url: "https://app.slack.com/client/T1" },
      { id: 2, url: "https://example.org/" },
    ],
  });
  chrome.grantedOrigins.add("https://app.slack.com/*");
  await syncWatchers(chrome, ["https://app.slack.com"]);
  assert.deepEqual(chrome.injected, [{ tabId: 10, files: ["src/unread_watch.js"] }]);
  await syncWatchers(chrome, ["https://app.slack.com"]);
  assert.equal(chrome.injected.length, 1, "nothing again for a site already watched");
});

test("the watcher keeps its pre-rename ID, so an update replaces the registered one", () => {
  assert.equal(WATCHER_ID, "tico-watch-extra");
});
