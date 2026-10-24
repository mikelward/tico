// Tests for tico.js against a fake chrome.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Tico } from "./tico.js";
import { FakeChrome, HD, UW } from "./fake_chrome.js";

const HOME = "chrome-extension://tico/src/home.html";
const homes = (chrome) => chrome.wins.filter((w) => w.url === HOME);
// The windows tico opened, other than home windows.
const opened = (chrome) => chrome.created.filter((c) => c.url !== HOME).map(({ id, ...c }) => c);

function on(display, id, extra = {}) {
  const a = display.workArea;
  return { id, left: a.left + 10 * id, top: a.top + 10, width: 400, height: 300, ...extra };
}

async function setup(displays, windows) {
  const chrome = new FakeChrome({ displays, windows });
  const tico = new Tico(chrome);
  await tico.event();
  return { chrome, tico };
}

test("two windows on a 16:9 display tile master and stack", async () => {
  const { chrome } = await setup([HD], [on(HD, 1, { focused: true }), on(HD, 2)]);
  assert.deepEqual(chrome.box(1), { x: 0, y: 0, w: 1056, h: 1032 });
  assert.deepEqual(chrome.box(2), { x: 1056, y: 0, w: 864, h: 1032 });
});

test("a lone window on an ultrawide is centered at 80%", async () => {
  const { chrome } = await setup([UW], [on(UW, 1)]);
  assert.deepEqual(chrome.box(1), { x: 1920 + 344, y: 0, w: 2752, h: 1392 });
});

test("an ultrawide starts in three columns", async () => {
  const { chrome } = await setup([UW], [on(UW, 1), on(UW, 2), on(UW, 3)]);
  assert.equal(chrome.box(1).x, 1920 + 860, "master in the middle");
});

test("switching workspaces minimizes the old windows and restores them on return", async () => {
  const { chrome, tico } = await setup([HD], [on(HD, 1, { focused: true }), on(HD, 2)]);
  await tico.command("workspace-2");
  assert.equal(chrome.win(1).state, "minimized");
  assert.equal(chrome.win(2).state, "minimized");
  chrome.open(on(HD, 9, { focused: true }));
  await tico.event();
  assert.deepEqual(chrome.box(9), { x: 0, y: 0, w: 1920, h: 1032 }, "a new window joins workspace 2");
  await tico.command("workspace-1");
  assert.equal(chrome.win(1).state, "normal");
  assert.equal(chrome.win(2).state, "normal");
  assert.equal(chrome.win(9).state, "minimized");
});

test("sending a window to a hidden workspace hides it and retiles the rest", async () => {
  const { chrome, tico } = await setup([HD], [on(HD, 1, { focused: true }), on(HD, 2)]);
  await tico.command("send-3");
  assert.equal(chrome.win(1).state, "minimized");
  assert.deepEqual(chrome.box(2), { x: 0, y: 0, w: 1920, h: 1032 });
});

test("a window you minimize stays minimized across a switch", async () => {
  const { chrome, tico } = await setup([HD], [on(HD, 1, { focused: true }), on(HD, 2)]);
  chrome.win(2).state = "minimized";
  await tico.event();
  assert.deepEqual(chrome.box(1), { x: 0, y: 0, w: 1920, h: 1032 }, "the rest retile");
  await tico.command("workspace-2");
  await tico.command("workspace-1");
  assert.equal(chrome.win(2).state, "minimized");
  assert.equal(chrome.win(1).state, "normal");
});

test("restoring a window from a hidden workspace brings its workspace", async () => {
  const { chrome, tico } = await setup([HD], [on(HD, 1, { focused: true }), on(HD, 2)]);
  await tico.command("send-4");
  // You pick window 1 from the shelf.
  chrome.win(1).state = "normal";
  chrome.focus(1);
  await tico.event();
  assert.equal(tico.state.displays.hd, 4);
  assert.equal(chrome.win(2).state, "minimized");
  assert.deepEqual(chrome.box(1), { x: 0, y: 0, w: 1920, h: 1032 });
});

test("dragging a window to the other display moves it to the workspace there", async () => {
  const { chrome, tico } = await setup([HD, UW], [on(HD, 1, { focused: true }), on(HD, 2), on(UW, 3)]);
  Object.assign(chrome.win(2), { left: 3000, top: 100 });
  await tico.event();
  assert.deepEqual(tico.state.workspaces[2].windows, [3, 2]);
  assert.deepEqual(chrome.box(1), { x: 0, y: 0, w: 1920, h: 1032 });
  assert.equal(chrome.box(2).x >= 1920, true);
});

test("popups aren't tiled or hidden", async () => {
  const { chrome, tico } = await setup([HD], [on(HD, 1, { focused: true }), on(HD, 2, { type: "popup" })]);
  const before = chrome.box(2);
  await tico.command("workspace-2");
  assert.deepEqual(chrome.box(2), before);
  assert.equal(chrome.win(2).state, "normal");
});

test("an always-on-top window floats", async () => {
  const { chrome } = await setup([HD], [on(HD, 1), on(HD, 2, { alwaysOnTop: true })]);
  assert.deepEqual(chrome.box(1), { x: 0, y: 0, w: 1920, h: 1032 });
  assert.deepEqual(chrome.box(2), on(HD, 2) && { x: 20, y: 10, w: 400, h: 300 });
});

test("focus-next and swap-master follow the stack", async () => {
  const { chrome, tico } = await setup([HD], [on(HD, 1, { focused: true }), on(HD, 2), on(HD, 3)]);
  await tico.command("focus-next");
  assert.equal(chrome.win(2).focused, true);
  await tico.command("swap-master");
  assert.deepEqual(tico.state.workspaces[1].windows, [2, 1, 3]);
  assert.equal(chrome.box(2).x, 0, "window 2 is the master now");
});

test("monocle gives every window the area, and toggles back", async () => {
  const { chrome, tico } = await setup([HD], [on(HD, 1, { focused: true }), on(HD, 2)]);
  await tico.command("monocle");
  assert.deepEqual(chrome.box(1), chrome.box(2));
  await tico.command("monocle");
  assert.equal(chrome.box(2).x, 1056);
});

test("grow widens the master by 0.025", async () => {
  const { chrome, tico } = await setup([HD], [on(HD, 1, { focused: true }), on(HD, 2)]);
  await tico.command("grow");
  assert.equal(chrome.box(1).w, Math.floor(1920 * 0.575 + 0.5));
});

test("state survives the worker stopping", async () => {
  const { chrome, tico } = await setup([HD], [on(HD, 1, { focused: true }), on(HD, 2)]);
  await tico.command("send-5");
  const fresh = new Tico(chrome);
  await fresh.event();
  assert.equal(fresh.state.windows[1].ws, 5);
  assert.equal(chrome.win(1).state, "minimized");
});

test("a closed window leaves its workspace", async () => {
  const { chrome, tico } = await setup([HD], [on(HD, 1, { focused: true }), on(HD, 2)]);
  chrome.wins = chrome.wins.filter((w) => w.id !== 2);
  await tico.event();
  assert.deepEqual(tico.state.workspaces[1].windows, [1]);
  assert.deepEqual(chrome.box(1), { x: 0, y: 0, w: 1920, h: 1032 });
});

test("maximized windows are left alone", async () => {
  const { chrome } = await setup([HD], [on(HD, 1, { state: "maximized" }), on(HD, 2)]);
  assert.deepEqual(chrome.box(2), { x: 0, y: 0, w: 1920, h: 1032 });
  assert.equal(chrome.win(1).width, 400);
});

test("a window already minimized when tico starts stays minimized", async () => {
  const { chrome, tico } = await setup([HD], [on(HD, 1, { focused: true }), on(HD, 2, { state: "minimized" })]);
  assert.equal(chrome.win(2).state, "minimized");
  assert.equal(tico.state.windows[2].minimizedByYou, true);
  assert.deepEqual(chrome.box(1), { x: 0, y: 0, w: 1920, h: 1032 });
});

test("an ordinary event never focuses a window on another display", async () => {
  const { chrome, tico } = await setup([HD, UW], [on(HD, 1, { focused: true }), on(HD, 2), on(UW, 3), on(UW, 4)]);
  await tico.command("monocle");
  chrome.focus(3);
  chrome.updates.length = 0;
  await tico.event();
  assert.equal(chrome.win(3).focused, true);
  assert.deepEqual(chrome.updates.filter((u) => u.focused), []);
});

test("returning to a workspace doesn't restore a window you minimized there", async () => {
  const { chrome, tico } = await setup([HD], [on(HD, 1), on(HD, 2, { focused: true })]);
  chrome.win(2).state = "minimized";
  chrome.win(2).focused = false;
  await tico.event();
  await tico.command("workspace-3");
  await tico.command("workspace-1");
  assert.equal(chrome.win(2).state, "minimized");
  assert.equal(chrome.win(1).focused, true);
});

test("a floating window moves with its workspace to the other display", async () => {
  const { chrome, tico } = await setup([HD, UW], [
    on(HD, 1, { focused: true }),
    on(HD, 2, { alwaysOnTop: true, left: 100, top: 50 }),
    on(UW, 3),
  ]);
  await tico.command("workspace-2");
  // The displays swapped, so workspace 1 and its floating window are on the ultrawide.
  assert.equal(tico.state.displays.uw, 1);
  assert.deepEqual(chrome.box(2), { x: 1920 + 100, y: 50, w: 400, h: 300 });
  await tico.event();
  assert.equal(tico.state.windows[2].ws, 1, "the next sync doesn't read it as a drag");
});

test("connecting a display shows its workspace's windows", async () => {
  const { chrome, tico } = await setup([HD], [on(HD, 1, { focused: true }), on(HD, 2)]);
  await tico.command("send-2");
  assert.equal(chrome.win(1).state, "minimized");
  chrome.displaysList = [HD, UW];
  await tico.event();
  assert.equal(tico.state.displays.uw, 2);
  assert.equal(tico.state.windows[1].minimizedByYou, false);
  assert.equal(chrome.win(1).state, "normal");
  assert.equal(chrome.box(1).x >= 1920, true, "on the new display");
});

test("disconnecting a display hides its workspace instead of moving it", async () => {
  const { chrome, tico } = await setup([HD, UW], [on(HD, 1, { focused: true }), on(UW, 2)]);
  chrome.displaysList = [HD];
  // ChromeOS moves the ultrawide's window onto the remaining display.
  Object.assign(chrome.win(2), { left: 100, top: 100 });
  await tico.event();
  assert.equal(tico.state.displays.hd, 1, "the remaining display keeps its workspace");
  assert.equal(tico.state.windows[2].ws, 2);
  assert.equal(chrome.win(2).state, "minimized");
  assert.deepEqual(chrome.box(1), { x: 0, y: 0, w: 1920, h: 1032 });
});

test("a focused popup on the other display makes commands act there", async () => {
  const { chrome, tico } = await setup([HD, UW], [on(HD, 1), on(UW, 2), on(UW, 3, { type: "popup", focused: true })]);
  await tico.command("workspace-3");
  assert.equal(tico.state.displays.uw, 3);
  assert.equal(tico.state.displays.hd, 1);
});

test("a floating window on a hidden workspace comes up on the display that shows it", async () => {
  const { chrome, tico } = await setup([HD, UW], [
    on(HD, 1, { focused: true }),
    on(HD, 2, { alwaysOnTop: true, left: 100, top: 50 }),
    on(UW, 3),
  ]);
  chrome.focus(2);
  await tico.event();
  await tico.command("send-4");
  assert.equal(chrome.win(2).state, "minimized");
  chrome.focus(3);
  await tico.event();
  await tico.command("workspace-4");
  assert.equal(tico.state.displays.uw, 4);
  assert.equal(chrome.win(2).state, "normal");
  assert.deepEqual(chrome.box(2), { x: 1920 + 100, y: 50, w: 400, h: 300 });
  await tico.event();
  assert.equal(tico.state.windows[2].ws, 4, "the next sync leaves it on workspace 4");
});

test("an app key focuses the app's window, bringing its workspace", async () => {
  const { chrome, tico } = await setup([HD], [
    on(HD, 1, { focused: true }),
    on(HD, 2, { type: "app", url: "https://calendar.google.com/calendar/u/0/r" }),
  ]);
  await tico.command("send-3");
  chrome.focus(2);
  await tico.event();
  await tico.command("send-4");
  // Window 2 is now alone on hidden workspace 4.
  chrome.focus(1);
  await tico.event();
  await tico.command("app-calendar");
  assert.equal(tico.state.displays.hd, 4);
  assert.equal(chrome.win(2).focused, true);
  assert.deepEqual(opened(chrome), [], "nothing new opened");
});

test("an app key with no window opens one and finds it next time", async () => {
  const { chrome, tico } = await setup([HD], [on(HD, 1, { focused: true })]);
  await tico.command("app-chat");
  assert.deepEqual(opened(chrome), [{ url: "https://chat.google.com/", type: "popup" }]);
  assert.deepEqual(tico.state.workspaces[1].windows, [1, 2], "the popup tiles like an app");
  assert.equal(chrome.box(2).x, 1056);
  chrome.focus(1);
  await tico.event();
  await tico.command("app-chat");
  assert.equal(opened(chrome).length, 1, "the second press focuses it");
  assert.equal(chrome.win(2).focused, true);
});

test("the browser key focuses a browser window on this workspace, else opens one", async () => {
  const { chrome, tico } = await setup([HD], [
    on(HD, 1, { type: "app", url: "https://music.youtube.com/", focused: true }),
    on(HD, 2, { url: "https://example.com/" }),
  ]);
  await tico.command("app-browser");
  assert.equal(chrome.win(2).focused, true);
  await tico.command("workspace-2");
  await tico.command("app-browser");
  assert.deepEqual(opened(chrome), [{ url: undefined, type: "normal" }]);
  assert.equal(tico.state.workspaces[2].windows.length, 1);
});

test("the browser key picks the most recently focused browser, not the first", async () => {
  const { chrome, tico } = await setup([HD], [
    on(HD, 1, { focused: true }),
    on(HD, 2),
    on(HD, 3, { type: "app", url: "https://meet.google.com/" }),
  ]);
  chrome.focus(2);
  await tico.event();
  chrome.focus(3);
  await tico.event();
  await tico.command("app-browser");
  assert.equal(chrome.win(2).focused, true);
});

test("a browser window showing an app's site is a browser, not the app", async () => {
  const { chrome, tico } = await setup([HD], [on(HD, 1, { url: "https://calendar.google.com/", focused: true })]);
  await tico.command("app-calendar");
  assert.deepEqual(chrome.created, [{ id: 2, url: "https://calendar.google.com/", type: "popup" }]);
  await tico.command("app-browser");
  assert.equal(chrome.created.length, 1, "the browser key finds the normal window");
  assert.equal(chrome.win(1).focused, true);
});

test("an app key focuses the app's newest window", async () => {
  const { chrome, tico } = await setup([HD], [
    on(HD, 1, { focused: true }),
    on(HD, 2, { type: "app", url: "https://meet.google.com/" }),
    on(HD, 3, { type: "app", url: "https://meet.google.com/" }),
  ]);
  await tico.command("app-meet");
  assert.equal(chrome.win(3).focused, true);
});

test("other popups stay untracked", async () => {
  const { tico } = await setup([HD], [on(HD, 1, { focused: true }), on(HD, 2, { type: "popup", url: "https://chat.google.com/" })]);
  assert.equal(2 in tico.state.windows, false);
});

test("an empty workspace gets a focused home window, and loses it when a window arrives", async () => {
  const { chrome, tico } = await setup([HD], [on(HD, 1, { focused: true })]);
  assert.equal(homes(chrome).length, 0);
  await tico.command("workspace-2");
  const [home] = homes(chrome);
  assert.ok(home, "a home window opened");
  assert.equal(home.focused, true);
  assert.equal(home.type, "popup");
  assert.equal(2 in tico.state.windows, false, "it isn't tracked or tiled");
  // A key pressed in the home window acts on its display.
  await tico.command("app-browser");
  assert.equal(homes(chrome).length, 0, "it closed when the browser window arrived");
  assert.deepEqual(chrome.removed, [home.id]);
});

test("switching between empty workspaces keeps one home window", async () => {
  const { chrome, tico } = await setup([HD], [on(HD, 1, { focused: true })]);
  await tico.command("workspace-2");
  await tico.command("workspace-3");
  assert.equal(homes(chrome).length, 1);
  await tico.command("workspace-1");
  assert.equal(homes(chrome).length, 0);
  assert.equal(chrome.win(1).focused, true);
});

test("a home window you close stays closed until another empty workspace", async () => {
  const { chrome, tico } = await setup([HD], [on(HD, 1, { focused: true })]);
  await tico.command("workspace-2");
  chrome.wins = chrome.wins.filter((w) => w.url !== HOME);
  await tico.event();
  assert.equal(homes(chrome).length, 0);
  await tico.command("workspace-3");
  assert.equal(homes(chrome).length, 1);
});

test("switching one display's workspace focuses only that display's home", async () => {
  const { chrome, tico } = await setup([HD, UW], [on(HD, 1, { focused: true }), on(UW, 2)]);
  await tico.command("send-4");
  chrome.focus(2);
  await tico.event();
  await tico.command("send-5");
  // Both displays now show empty workspaces, each with a home window.
  const hdHome = () => homes(chrome).find((w) => w.left < 1920);
  chrome.focus(hdHome().id);
  await tico.event();
  await tico.command("workspace-3");
  assert.equal(tico.state.displays.hd, 3);
  assert.equal(hdHome().focused, true, "focus stays on the display you switched");
});

test("a disconnected display's home window closes", async () => {
  const { chrome, tico } = await setup([HD, UW], [on(HD, 1, { focused: true }), on(UW, 2)]);
  chrome.focus(2);
  await tico.event();
  await tico.command("send-4");
  const [home] = homes(chrome);
  assert.ok(home.left >= 1920, "the ultrawide got a home");
  chrome.displaysList = [HD];
  Object.assign(home, { left: 100, top: 100 });
  await tico.event();
  assert.equal(homes(chrome).length, 0);
  assert.deepEqual(tico.state.homes, {});
});

test("the last window leaving a workspace brings the home window", async () => {
  const { chrome, tico } = await setup([HD], [on(HD, 1, { focused: true })]);
  await tico.command("send-2");
  assert.equal(homes(chrome).length, 1);
});
