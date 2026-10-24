// Tests for workspaces.js: the cases SPEC.md §6.1 and its reviews named.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as ws from "./workspaces.js";

// Two displays, "a" showing 1 and "b" showing 2, with windows 10 and 11 on 1
// and 20 on 2.
function twoDisplays() {
  let s = ws.create(["a", "b"]);
  s = ws.addWindow(s, 10, "a");
  s = ws.addWindow(s, 11, "a");
  s = ws.addWindow(s, 20, "b");
  return s;
}

const none = new Set();
const shown = (s) => [10, 11, 20, 30].filter((id) => ws.isShown(s, id));

test("each display starts on its own workspace", () => {
  const s = ws.create(["a", "b"]);
  assert.equal(ws.showing(s, "a"), 1);
  assert.equal(ws.showing(s, "b"), 2);
});

test("a new window joins the end of the stack on its display's workspace", () => {
  const s = twoDisplays();
  assert.deepEqual(s.workspaces[1].windows, [10, 11]);
  assert.deepEqual(s.workspaces[2].windows, [20]);
});

test("switching hides the old workspace's windows and shows the new one's", () => {
  let s = twoDisplays();
  s = ws.addWindow(ws.show(s, "a", 3), 30, "a");
  s = ws.show(s, "a", 1);
  assert.deepEqual(shown(s), [10, 11, 20]);
  assert.deepEqual(ws.plan(s, new Set([10, 11])), { restore: [10, 11], minimize: [30] });
});

test("showing a workspace that's on the other display swaps them", () => {
  const s = ws.show(twoDisplays(), "a", 2);
  assert.equal(ws.showing(s, "a"), 2);
  assert.equal(ws.showing(s, "b"), 1);
  assert.deepEqual(shown(s), [10, 11, 20]);
});

test("a window you minimized stays minimized across a switch", () => {
  let s = ws.userMinimized(twoDisplays(), 11);
  s = ws.show(s, "a", 3);
  s = ws.show(s, "a", 1);
  assert.deepEqual(ws.plan(s, new Set([10, 11])), { restore: [10], minimize: [] });
});

test("minimize then restore on the same workspace keeps the window up", () => {
  let s = ws.userMinimized(twoDisplays(), 11);
  s = ws.userRestored(s, 11, "a");
  assert.equal(ws.isShown(s, 11), true);
  assert.deepEqual(ws.plan(s, none), { restore: [], minimize: [] });
});

test("restoring a window on a hidden workspace brings the workspace", () => {
  let s = ws.show(twoDisplays(), "a", 3);
  s = ws.userRestored(s, 10, "a");
  assert.equal(ws.showing(s, "a"), 1);
  assert.equal(s.workspaces[1].focused, 10);
});

test("sending to a workspace showing on another display shows it there", () => {
  const s = ws.send(twoDisplays(), 10, 2);
  assert.deepEqual(s.workspaces[2].windows, [20, 10]);
  assert.equal(ws.isShown(s, 10), true);
  assert.deepEqual(ws.plan(s, none), { restore: [], minimize: [] });
});

test("a focused window stays focused on the workspace it moves to", () => {
  let s = ws.focused(twoDisplays(), 20);
  s = ws.focused(s, 10);
  s = ws.movedToDisplay(s, 10, "b");
  assert.equal(s.workspaces[2].focused, 10);
  assert.equal(s.workspaces[1].focused, null);
  s = ws.send(s, 11, 2);
  assert.equal(s.workspaces[2].focused, 10, "an unfocused window doesn't take focus");
});

test("sending to a hidden workspace hides the window", () => {
  const s = ws.send(twoDisplays(), 10, 5);
  assert.equal(ws.isShown(s, 10), false);
  assert.deepEqual(ws.plan(s, none), { restore: [], minimize: [10] });
});

test("activating a window on a hidden workspace shows that workspace on the focused display", () => {
  let s = ws.send(twoDisplays(), 10, 5);
  s = ws.activate(s, 10, "b");
  assert.equal(ws.showing(s, "b"), 5);
  assert.equal(ws.showing(s, "a"), 1);
  assert.equal(ws.isShown(s, 10), true);
});

test("activating a window on a showing workspace changes no display", () => {
  const before = twoDisplays();
  const s = ws.activate(before, 20, "a");
  assert.deepEqual(s.displays, before.displays);
  assert.equal(s.workspaces[2].focused, 20);
});

test("moving a window to another display moves it to the workspace there", () => {
  const s = ws.movedToDisplay(twoDisplays(), 11, "b");
  assert.deepEqual(s.workspaces[1].windows, [10]);
  assert.deepEqual(s.workspaces[2].windows, [20, 11]);
  assert.equal(ws.isShown(s, 11), true);
});

test("a removed display's workspace hides, and a new one takes the lowest hidden", () => {
  let s = ws.setDisplays(twoDisplays(), ["a"]);
  assert.equal(ws.isShown(s, 20), false);
  s = ws.setDisplays(s, ["a", "c"]);
  assert.equal(ws.showing(s, "c"), 2);
});

test("operations don't change the state they were given", () => {
  const s = twoDisplays();
  const copy = structuredClone(s);
  ws.show(s, "a", 3);
  ws.send(s, 10, 4);
  ws.userMinimized(s, 11);
  ws.removeWindow(s, 20);
  assert.deepEqual(s, copy);
});

test("removing a window drops it from its workspace", () => {
  const s = ws.removeWindow(twoDisplays(), 10);
  assert.deepEqual(s.workspaces[1].windows, [11]);
  assert.equal(10 in s.windows, false);
});

test("stack moves wrap and swapMaster swaps with the master", () => {
  let s = ws.addWindow(twoDisplays(), 12, "a");
  assert.equal(ws.neighbor(s, 12, 1), 10);
  assert.equal(ws.neighbor(s, 10, -1), 12);
  s = ws.swapMaster(s, 12);
  assert.deepEqual(s.workspaces[1].windows, [12, 11, 10]);
  s = ws.swapMaster(s, 12);
  assert.deepEqual(s.workspaces[1].windows, [11, 12, 10]);
  s = ws.moveInStack(s, 11, -1);
  assert.deepEqual(s.workspaces[1].windows, [10, 12, 11]);
});

test("tiled lists the showing workspace's windows you haven't minimized", () => {
  const s = ws.userMinimized(twoDisplays(), 10);
  assert.deepEqual(ws.tiled(s, "a"), [11]);
});

test("a floating window shows and hides with its workspace but takes no tile", () => {
  let s = ws.toggleFloating(twoDisplays(), 11);
  assert.deepEqual(ws.tiled(s, "a"), [10]);
  assert.equal(ws.neighbor(s, 10, 1), 10, "the stack skips it");
  s = ws.show(s, "a", 3);
  assert.equal(ws.isShown(s, 11), false);
  s = ws.toggleFloating(ws.show(s, "a", 1), 11);
  assert.deepEqual(ws.tiled(s, "a"), [10, 11]);
});

test("stack moves on a window that isn't tiled change nothing", () => {
  const s = ws.toggleFloating(twoDisplays(), 11);
  assert.deepEqual(ws.moveInStack(s, 11, 1).workspaces[1].windows, [10, 11]);
  assert.deepEqual(ws.swapMaster(s, 11).workspaces[1].windows, [10, 11]);
});

test("monocle toggles back to the layout before it", () => {
  let s = ws.setLayout(ws.create(["a"]), 1, "twocol");
  s = ws.toggleMonocle(s, 1, "twocol");
  assert.equal(s.workspaces[1].layout, "monocle");
  s = ws.toggleMonocle(s, 1, "monocle");
  assert.equal(s.workspaces[1].layout, "twocol");
  s = ws.toggleMonocle(ws.create(["a"]), 1, "tile");
  s = ws.toggleMonocle(s, 1, "monocle");
  assert.equal(s.workspaces[1].layout, null, "back to the display's default");
});

test("stack moves leave minimized and floating windows in their places", () => {
  let s = ws.addWindow(twoDisplays(), 12, "a");
  s = ws.userMinimized(s, 10);
  s = ws.swapMaster(s, 12);
  assert.deepEqual(s.workspaces[1].windows, [10, 12, 11], "10 keeps the master slot");
  s = ws.userRestored(s, 10, "a");
  assert.deepEqual(ws.tiled(s, "a"), [10, 12, 11]);
  s = ws.toggleFloating(s, 12);
  s = ws.moveInStack(s, 11, -1);
  assert.deepEqual(s.workspaces[1].windows, [11, 12, 10]);
});

test("mfact and the master count stay in range", () => {
  let s = ws.create(["a"]);
  for (let i = 0; i < 40; i++) s = ws.adjust(s, 1, "tile", { mfact: 0.025, nmaster: -1 });
  assert.equal(s.workspaces[1].modes.tile.mfact, 0.95);
  assert.equal(s.workspaces[1].modes.tile.nmaster, 1);
  assert.equal(s.workspaces[2].modes.tile.mfact, 0.55, "other workspaces untouched");
});

test("a renamed window keeps its workspace, place and settings", () => {
  let s = ws.create(["hd"]);
  s = ws.addWindow(s, 1, "hd");
  s = ws.addWindow(s, 2, "hd");
  s = ws.send(s, 2, 3);
  s = ws.toggleFloating(s, 1);
  s = ws.focused(s, 1);
  const r = ws.renameWindows(s, new Map([[1, 11], [2, 12]]));
  assert.deepEqual(r.workspaces[1].windows, [11]);
  assert.deepEqual(r.workspaces[3].windows, [12]);
  assert.equal(r.workspaces[1].focused, 11);
  assert.equal(r.windows[11].floating, true);
  assert.equal(1 in r.windows, false);
});
