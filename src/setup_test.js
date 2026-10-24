import { test } from "node:test";
import assert from "node:assert/strict";
import { ITEMS, progress, SETUP_KEY, tick } from "./setup.js";

test("every item has an id of its own, a title, what to do, and its spec section", () => {
  assert.equal(new Set(ITEMS.map((i) => i.id)).size, ITEMS.length);
  for (const i of ITEMS) {
    assert.ok(i.title && i.how && i.ref, i.id);
    assert.ok(i.where === "" || i.where.startsWith("chrome://"), `${i.id}: ${i.where}`);
  }
});

test("progress counts what's ticked, ignoring items that are gone", () => {
  assert.deepEqual(progress(undefined), { done: [], left: ITEMS.length });
  assert.deepEqual(progress(["dark", "gone", "desks"]), { done: ["desks", "dark"], left: ITEMS.length - 2 });
});

test("ticks made together are all kept", async () => {
  const stored = {};
  const area = {
    get: async (key) => ({ [key]: stored[key] }),
    set: async (items) => {
      await new Promise((r) => setImmediate(r));
      Object.assign(stored, items);
    },
  };
  await Promise.all([tick(area, "desks", true), tick(area, "shelf", true), tick(area, "dark", true)]);
  assert.deepEqual(progress(stored[SETUP_KEY]).done, ["desks", "shelf", "dark"]);
  await tick(area, "shelf", false);
  assert.deepEqual(stored[SETUP_KEY], ["desks", "dark"]);
});
