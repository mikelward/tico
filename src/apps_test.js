import { test } from "node:test";
import assert from "node:assert/strict";
import { appOf } from "./apps.js";

test("a window belongs to the app whose origin its tab is on", () => {
  assert.equal(appOf({ tabs: [{ url: "https://meet.google.com/abc-defg-hij" }] }).command, "app-meet");
  assert.equal(appOf({ tabs: [{ url: "https://google.com/" }] }), null);
  assert.equal(appOf({ tabs: [{ url: "chrome://newtab/" }] }), null);
  assert.equal(appOf({ tabs: [] }), null);
  assert.equal(appOf({}), null);
});
