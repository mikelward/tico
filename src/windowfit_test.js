import { test } from "node:test";
import assert from "node:assert/strict";
import { fitHeight } from "./windowfit.js";

test("a window grows to its content plus its frame", () => {
  // A 160 px window with a 32 px title bar, showing 300 px of content.
  assert.equal(fitHeight({ content: 300, outer: 160, inner: 128, available: 1000 }), 332);
});

test("a window shrinks back when its content does", () => {
  assert.equal(fitHeight({ content: 100, outer: 332, inner: 300, available: 1000 }), 132);
});

test("a window is never taller than the screen allows", () => {
  assert.equal(fitHeight({ content: 2000, outer: 160, inner: 128, available: 1000 }), 1000);
});
