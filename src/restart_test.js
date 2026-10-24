import { test } from "node:test";
import assert from "node:assert/strict";
import { matchWindows, windowUrls } from "./restart.js";

test("each new window takes the old one it shares tabs with", () => {
  const old = { 1: ["https://mail.google.com/"], 2: ["https://docs.google.com/a", "https://github.com/"] };
  const current = [
    { id: 11, urls: ["https://github.com/", "https://docs.google.com/a"] },
    { id: 12, urls: ["https://mail.google.com/"] },
  ];
  assert.deepEqual([...matchWindows(old, current)], [[2, 11], [1, 12]]);
});

test("the closest fit wins, and each window is used once", () => {
  const old = { 1: ["https://a/"], 2: ["https://a/", "https://b/", "https://c/"] };
  const current = [
    { id: 11, urls: ["https://a/"] },
    { id: 12, urls: ["https://a/", "https://b/", "https://c/"] },
  ];
  assert.deepEqual(new Map(matchWindows(old, current)), new Map([[2, 12], [1, 11]]));
});

test("a page open twice doesn't outscore an exact match", () => {
  const old = { 1: ["https://a/", "https://b/"] };
  const current = [
    { id: 11, urls: ["https://a/", "https://a/", "https://a/"] },
    { id: 12, urls: ["https://a/", "https://b/"] },
  ];
  assert.deepEqual([...matchWindows(old, current)], [[1, 12]]);
});

test("a window that shares nothing isn't matched", () => {
  assert.deepEqual(matchWindows({ 1: ["https://a/"] }, [{ id: 11, urls: ["https://b/"] }]).size, 0);
  assert.deepEqual(matchWindows({ 1: undefined }, [{ id: 11, urls: ["https://b/"] }]).size, 0);
});

test("a window's URLs are its tabs', pending ones too, capped", () => {
  assert.deepEqual(windowUrls({ tabs: [{ url: "https://a/" }, { pendingUrl: "https://b/" }, {}] }), ["https://a/", "https://b/"]);
  assert.equal(windowUrls({ tabs: Array.from({ length: 30 }, (_, i) => ({ url: `https://${i}/` })) }).length, 20);
  assert.deepEqual(windowUrls({}), []);
});
