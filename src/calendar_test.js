import { test } from "node:test";
import assert from "node:assert/strict";
import { isoWeek, monthGrid, monthTitle, stepMonth } from "./calendar.js";

test("ISO weeks start on Monday, and week 1 holds the year's first Thursday", () => {
  assert.equal(isoWeek(2026, 8, 28), 40);
  assert.equal(isoWeek(2026, 0, 1), 1);
  assert.equal(isoWeek(2027, 0, 1), 53);
  assert.equal(isoWeek(2027, 0, 4), 1);
  assert.equal(isoWeek(2024, 11, 30), 1);
});

test("months step across years", () => {
  assert.deepEqual(stepMonth(2026, 11, 1), { year: 2027, month: 0 });
  assert.deepEqual(stepMonth(2026, 0, -1), { year: 2025, month: 11 });
  assert.equal(monthTitle(2026, 8), "September 2026");
});

test("the month grid runs Monday to Sunday, padded from the months either side", () => {
  const weeks = monthGrid(2026, 8, { year: 2026, month: 8, date: 28 });
  assert.deepEqual(weeks.map((w) => w.week), [36, 37, 38, 39, 40]);
  assert.deepEqual(weeks[0].days.map((d) => d.date), [31, 1, 2, 3, 4, 5, 6]);
  assert.equal(weeks[0].days[0].outside, true);
  assert.deepEqual(weeks[4].days.map((d) => d.date), [28, 29, 30, 1, 2, 3, 4]);
  assert.equal(weeks[4].days[0].today, true);
  assert.equal(weeks.flatMap((w) => w.days).filter((d) => d.today).length, 1);
});

test("a month starting on Monday has no days from before it", () => {
  // June 2026 starts on a Monday.
  const weeks = monthGrid(2026, 5, null);
  assert.deepEqual(weeks[0].days.map((d) => d.date), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(weeks.length, 5);
});
