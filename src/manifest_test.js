// Tests for manifest.json and background.js.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Tico } from "./tico.js";
import { FakeChrome, HD } from "./fake_chrome.js";
import { WATCHED } from "./unread.js";

const manifest = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url)));

// The keys Chromium accepts for a command (ui/base/accelerators/command.cc).
const KEYS = /^([A-Z0-9]|Comma|Period|Up|Down|Left|Right|Insert|Delete|Home|End|PageUp|PageDown|Space|Tab)$/;

test("at most four commands suggest a key, as Chromium allows", () => {
  const suggested = Object.values(manifest.commands).filter((c) => c.suggested_key);
  assert.ok(suggested.length <= 4, `${suggested.length} suggest keys`);
});

test("every suggested key is one Chromium can bind, on every platform", () => {
  for (const [name, c] of Object.entries(manifest.commands)) {
    if (!c.suggested_key) continue;
    assert.ok("default" in c.suggested_key, `${name} has no default, so it fails to install off ChromeOS`);
    for (const [platform, combo] of Object.entries(c.suggested_key)) {
      const parts = combo.split("+");
      const key = parts.pop();
      assert.match(key, KEYS, `${name} ${platform}: ${combo}`);
      for (const mod of parts) {
        assert.ok(["Ctrl", "Alt", "Shift", "Command", "MacCtrl", "Search"].includes(mod), `${name}: ${mod}`);
        if (mod === "Search") assert.equal(platform, "chromeos", `${name}: Search only works on ChromeOS`);
      }
    }
  }
});

test("the title watcher runs on the watched origins and nowhere else", () => {
  assert.deepEqual(manifest.content_scripts, [{ matches: WATCHED, js: ["src/unread_watch.js"], run_at: "document_idle" }]);
  assert.equal(manifest.host_permissions, undefined, "no host access beyond the content script's");
});

test("all-sites access is optional, for the dim alone", () => {
  assert.deepEqual(manifest.optional_host_permissions, ["<all_urls>"]);
  assert.ok(manifest.permissions.includes("scripting"));
});

test("every command in the manifest does something", async () => {
  for (const name of Object.keys(manifest.commands)) {
    const chrome = new FakeChrome({
      displays: [HD],
      windows: [
        { id: 1, left: 0, top: 0, width: 400, height: 300, focused: true },
        { id: 2, left: 500, top: 0, width: 400, height: 300 },
      ],
    });
    const tico = new Tico(chrome);
    await tico.event();
    // Removing a master needs a second one to remove, and going or sending
    // to workspace 1 needs to start somewhere else.
    if (name === "master-remove") await tico.command("master-add");
    // Search+Tab with nothing marked goes back to the last window you were in.
    if (name === "attention") {
      chrome.focus(2);
      await tico.event();
      chrome.focus(1);
      await tico.event();
    }
    if (name.endsWith("-1")) {
      await tico.command("workspace-2");
      chrome.open({ id: 9, left: 0, top: 0, width: 400, height: 300 });
      chrome.focus(9);
      await tico.event();
    }
    const before = JSON.stringify([tico.state, chrome.wins]);
    chrome.updates.length = 0;
    await tico.command(name);
    const after = JSON.stringify([tico.state, chrome.wins]);
    const acted = before !== after || chrome.updates.some((u) => u.focused);
    assert.ok(acted, `${name} changed nothing`);
  }
});

test("background.js adds every listener while it first runs", async () => {
  const added = new Set();
  const event = (name) => ({ addListener: () => added.add(name) });
  globalThis.chrome = {
    commands: { onCommand: event("commands.onCommand") },
    windows: {
      onCreated: event("windows.onCreated"),
      onRemoved: event("windows.onRemoved"),
      onFocusChanged: event("windows.onFocusChanged"),
      onBoundsChanged: event("windows.onBoundsChanged"),
    },
    system: { display: { onDisplayChanged: event("system.display.onDisplayChanged") } },
    tabs: { onActivated: event("tabs.onActivated"), onUpdated: event("tabs.onUpdated") },
    action: { onClicked: event("action.onClicked") },
    permissions: { onAdded: event("permissions.onAdded"), onRemoved: event("permissions.onRemoved") },
    runtime: {
      onStartup: event("runtime.onStartup"),
      onInstalled: event("runtime.onInstalled"),
      onMessage: event("runtime.onMessage"),
      getManifest: () => manifest,
    },
  };
  await import("./background.js");
  assert.deepEqual([...added].sort(), [
    "action.onClicked",
    "commands.onCommand",
    "permissions.onAdded",
    "permissions.onRemoved",
    "runtime.onInstalled",
    "runtime.onMessage",
    "runtime.onStartup",
    "system.display.onDisplayChanged",
    "tabs.onActivated",
    "tabs.onUpdated",
    "windows.onBoundsChanged",
    "windows.onCreated",
    "windows.onFocusChanged",
    "windows.onRemoved",
  ]);
  delete globalThis.chrome;
});
