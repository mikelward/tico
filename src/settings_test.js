import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS, load, resolve, SETTINGS_KEY } from "./settings.js";

test("nothing stored means the defaults", () => {
  assert.deepEqual(resolve(undefined, undefined), { settings: DEFAULT_SETTINGS, errors: [] });
});

test("stored settings replace the defaults, and this machine's win", () => {
  const clocks = [{ zone: "Asia/Tokyo", label: "TYO" }];
  const { settings, errors } = resolve({ clocks, work: [8, 16] }, { work: [10, 18] });
  assert.deepEqual(errors, []);
  assert.deepEqual(settings.clocks, clocks);
  assert.deepEqual(settings.work, [10, 18], "the per-machine value");
  assert.deepEqual(settings.day, DEFAULT_SETTINGS.day, "what's left out keeps its default");
});

test("a clock keeps its city when it has one, trimmed", () => {
  const { settings } = resolve({ clocks: [{ zone: "Asia/Kolkata", label: " BLR ", city: " Bangalore " }] });
  assert.deepEqual(settings.clocks, [{ zone: "Asia/Kolkata", label: "BLR", city: "Bangalore" }]);
});

test("a bad setting is an error naming it, and it keeps its default", () => {
  const { settings, errors } = resolve({
    clocks: [{ zone: "Asia/Tokyo", label: "TYO" }, { zone: "Mars/Olympus", label: "MRS" }],
    day: [19, 7],
    work: [9, 17],
    colour: "gray",
  });
  assert.deepEqual(errors, [
    "clocks: clock 2: unknown time zone: Mars/Olympus",
    "day: 19–7 isn't a span within 0–24",
    "unknown setting: colour",
  ]);
  assert.deepEqual(settings.clocks, DEFAULT_SETTINGS.clocks);
  assert.deepEqual(settings.day, DEFAULT_SETTINGS.day);
  assert.deepEqual(settings.work, [9, 17], "the good ones still apply");
});

test("each part of a clock and an hour span is checked", () => {
  const errors = (value) => resolve(value).errors;
  assert.deepEqual(errors({ clocks: "SF" }), ["clocks: must be a list"]);
  assert.deepEqual(errors({ clocks: [{ label: "SF" }] }), ["clocks: clock 1 has no zone"]);
  assert.deepEqual(errors({ clocks: [{ zone: "Asia/Tokyo" }] }), ["clocks: clock 1 has no label"]);
  assert.deepEqual(errors({ clocks: [{ zone: "Asia/Tokyo", label: "TOKYO" }] }), [
    `clocks: clock 1's label "TOKYO" is longer than 4 letters`,
  ]);
  assert.deepEqual(errors({ work: [9.5, 17] }), ["work: must be two whole hours, like [9, 17]"]);
  assert.deepEqual(errors({ work: [9, 25] }), ["work: 9–25 isn't a span within 0–24"]);
  assert.deepEqual(errors([]), ["settings must be an object"]);
});

test("load reads sync, then local", async () => {
  const stored = { sync: { [SETTINGS_KEY]: { work: [8, 16] } }, local: {} };
  const area = (name) => ({ get: async (key) => (key in stored[name] ? { [key]: stored[name][key] } : {}) });
  const { settings } = await load({ sync: area("sync"), local: area("local") });
  assert.deepEqual(settings.work, [8, 16]);
});
