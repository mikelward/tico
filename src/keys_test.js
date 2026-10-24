import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checklist, intendedKey } from "./keys.js";

const manifest = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url))).commands;

test("the intended key is the one in a description's closing parentheses", () => {
  assert.equal(intendedKey("Focus the next window in the stack (Search+J)"), "Search+J");
  assert.equal(intendedKey("Grow the master (Search+Shift+.)"), "Search+Shift+.");
  assert.equal(intendedKey("No key here"), "");
});

test("each command is bound, bound to another key, or still to bind", () => {
  const rows = checklist(manifest, [
    { name: "focus-next", shortcut: "Search+J" },
    { name: "focus-prev", shortcut: "Search+Shift+K" },
    { name: "float", shortcut: "" },
  ]);
  const by = Object.fromEntries(rows.map((r) => [r.name, r]));
  assert.equal(by["focus-next"].state, "bound");
  assert.equal(by["focus-prev"].state, "other");
  assert.equal(by["focus-prev"].bound, "Search+Shift+K");
  assert.equal(by["float"].state, "unbound");
  assert.equal(by["workspace-1"].state, "unbound", "a command Chrome didn't list is unbound");
  assert.equal(by["float"].title, "Toggle floating");
  assert.equal(by["float"].intended, "Search+Shift+F");
  assert.equal(rows.length, Object.keys(manifest).length, "every command, once");
});

test("keys match whatever order Chrome lists the modifiers in", () => {
  const [row] = checklist({ x: { description: "X (Search+Shift+M)" } }, [{ name: "x", shortcut: "Shift+Search+M" }]);
  assert.equal(row.state, "bound");
});
