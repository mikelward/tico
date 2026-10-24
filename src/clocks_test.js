import { test } from "node:test";
import assert from "node:assert/strict";
import { checkZone, clockRow, nextOffsetChange, offsetMinutes } from "./clocks.js";

// 2026-10-24 23:30 in London (BST), 15:30 in SF, 18:30 in NYC.
const T = new Date("2026-10-24T22:30:00Z");

test("the row is SF, NYC, LON, then local with its date", () => {
  assert.deepEqual(clockRow(T, "Australia/Sydney"), [
    { label: "SF", time: "15:30", day: -1 },
    { label: "NYC", time: "18:30", day: -1 },
    { label: "LON", time: "23:30", day: -1 },
    { label: "Oct 25", time: "09:30", day: 0, local: true },
  ]);
});

test("a listed zone that is the local zone is hidden", () => {
  const row = clockRow(T, "Europe/London");
  assert.deepEqual(row.map((r) => r.label), ["SF", "NYC", "Oct 24"]);
});

test("a zone that only shares local's offset stays", () => {
  const row = clockRow(T, "Europe/Dublin");
  assert.deepEqual(row.map((r) => r.label), ["SF", "NYC", "LON", "Oct 24"]);
});

test("a later date shows +1", () => {
  const row = clockRow(new Date("2026-10-24T20:00:00Z"), "America/Los_Angeles");
  assert.deepEqual(row.find((r) => r.label === "LON"), { label: "LON", time: "21:00", day: 0 });
  const late = clockRow(new Date("2026-10-25T05:30:00Z"), "America/Los_Angeles");
  assert.deepEqual(late.find((r) => r.label === "LON"), { label: "LON", time: "05:30", day: 1 });
});

test("an unknown zone is an error naming it", () => {
  assert.throws(() => checkZone("Mars/Olympus_Mons"), /Mars\/Olympus_Mons/);
  checkZone("America/New_York");
});

test("London leaves BST at 01:00 UTC on Sunday 25 October 2026", () => {
  assert.equal(offsetMinutes(T, "Europe/London"), 60);
  assert.equal(nextOffsetChange(T, "Europe/London").toISOString(), "2026-10-25T01:00:00.000Z");
});

test("a zone with no DST has no next change", () => {
  assert.equal(nextOffsetChange(T, "Asia/Tokyo"), null);
});
