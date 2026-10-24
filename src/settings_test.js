import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS, load, PER_MACHINE, pick, resolve, SETTINGS_KEY, settingsChanged, SHARED } from "./settings.js";

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

test("each app key can be given any website, or none", () => {
  const { settings, errors } = resolve({
    apps: [{ command: "app-meet", name: " Linear ", url: "https://linear.app" }],
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(settings.apps, [{ command: "app-meet", name: "Linear", url: "https://linear.app/" }]);
});

test("a bad app is an error naming it", () => {
  const errors = (apps) => resolve({ apps }).errors;
  assert.deepEqual(errors([{ command: "app-mail", name: "Mail", url: "https://mail.google.com/" }]), [
    "apps: app 1's command must be one of app-calendar, app-chat, app-meet, app-music",
  ]);
  assert.deepEqual(errors([{ command: "app-meet", name: "Meet", url: "meet" }]), [`apps: app 1's address "meet" isn't a URL`]);
  assert.deepEqual(errors([{ command: "app-meet", name: "Files", url: "file:///home" }]), ["apps: app 1's address must be a website"]);
  assert.deepEqual(errors([{ command: "app-meet", url: "https://meet.google.com/" }]), ["apps: app 1 has no name"]);
  const twice = { command: "app-meet", name: "Meet", url: "https://meet.google.com/" };
  assert.deepEqual(errors([twice, twice]), ["apps: app 2: app-meet has two apps"]);
  assert.deepEqual(
    errors([
      { command: "app-meet", name: "A", url: "https://example.com/a" },
      { command: "app-music", name: "B", url: "https://example.com/b" },
    ]),
    ["apps: app 2: https://example.com is already app 1's site"],
    "windows match apps by origin, so two can't share one",
  );
});

test("layouts are set per Chromebook, and checked", () => {
  const { settings, errors } = resolve(undefined, { singleRules: [{ minAspect: 1.7, width: 0.6 }], ultrawideAspect: 2.3 });
  assert.deepEqual(errors, []);
  assert.deepEqual(settings.singleRules, [{ minAspect: 1.7, width: 0.6 }]);
  assert.equal(settings.ultrawideAspect, 2.3);
  assert.deepEqual(resolve(undefined, { ultrawideAspect: 0.5 }).errors, ["ultrawideAspect: 0.5 isn't an aspect ratio from 1 to 10, like 2.1"]);
  assert.deepEqual(resolve(undefined, { singleRules: [{ minAspect: 2, width: 80 }] }).errors, [
    "singleRules: rule 1: width 80 isn't a fraction from 0.1 to 1, like 0.8",
  ]);
  assert.deepEqual(resolve(undefined, { singleRules: [{ minAspect: NaN, width: 0.8 }] }).errors, [
    "singleRules: rule 1: NaN isn't an aspect ratio from 1 to 10, like 2.1",
  ]);
});

test("pick keeps the shared settings apart from this Chromebook's", () => {
  const all = resolve().settings;
  assert.deepEqual(Object.keys(pick(all, SHARED)), ["clocks", "day", "work", "apps"]);
  assert.deepEqual(Object.keys(pick(all, PER_MACHINE)), ["singleRules", "ultrawideAspect"]);
});

test("a settings change applies at once, but tico's own state writes don't count", () => {
  assert.equal(settingsChanged({ settings: { newValue: { ultrawideAspect: 3 } } }), true);
  assert.equal(settingsChanged({ state: { newValue: {} }, view: { newValue: {} } }), false);
});
