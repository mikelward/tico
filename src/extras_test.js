import { test } from "node:test";
import assert from "node:assert/strict";
import { addDefaultSites, EXTRAS, isOn } from "./extras.js";
import { FakeChrome, HD } from "./fake_chrome.js";
import { DEFAULT_SITES } from "./unread.js";

const extra = (id) => EXTRAS.find((e) => e.id === id);

test("allowing unread counts puts back Gmail, Chat and Calendar, keeping other sites", async () => {
  const chrome = new FakeChrome({ displays: [HD] });
  chrome.syncStore.settings = { watched: ["https://app.slack.com", "https://mail.google.com"], dimStrength: 0.2 };
  chrome.storage.sync.set = async (items) => Object.assign(chrome.syncStore, structuredClone(items));
  await addDefaultSites(chrome.storage);
  assert.deepEqual(chrome.syncStore.settings, {
    watched: ["https://app.slack.com", "https://mail.google.com", "https://chat.google.com", "https://calendar.google.com"],
    dimStrength: 0.2,
  });
});

test("unread counts are on only with their access and their sites in the list", async () => {
  const chrome = new FakeChrome({ displays: [HD] });
  assert.equal(await isOn(chrome, extra("unread")), false, "no access");
  chrome.granted = true;
  assert.equal(await isOn(chrome, extra("unread")), true, "the default list");
  chrome.syncStore.settings = { watched: [] };
  assert.equal(await isOn(chrome, extra("unread")), false, "taken out of the list");
  chrome.syncStore.settings = { watched: DEFAULT_SITES };
  assert.equal(await isOn(chrome, extra("dim")), true);
});
