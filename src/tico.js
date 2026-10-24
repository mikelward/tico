// tico's core: it reads Chrome's windows and displays, applies an operation
// to the workspace state, and makes the screen match (SPEC.md §5, §6).
// `api` is `chrome` in the extension and a fake in the tests; only its
// promise-returning calls are used.

import { appOf, DEFAULT_APPS } from "./apps.js";
import * as geometry from "./geometry.js";
import * as ws from "./workspaces.js";

export const DEFAULTS = {
  singleRules: [{ minAspect: 2.1, width: 0.8 }],
  ultrawideAspect: 2.1,
};

// Window types tico manages. Popups and devtools float untracked (§5.4),
// except the app popups tico opens itself (§9.1).
const MANAGED = ["normal", "app"];
const STATE_KEY = "state";
const VIEW_KEY = "view";

function area(display) {
  const a = display.workArea;
  return { x: a.left, y: a.top, w: a.width, h: a.height };
}

// The display holding a window's center, else the first.
export function displayFor(win, displays) {
  const cx = win.left + win.width / 2;
  const cy = win.top + win.height / 2;
  const hit = displays.find((d) => {
    const b = d.bounds;
    return cx >= b.left && cx < b.left + b.width && cy >= b.top && cy < b.top + b.height;
  });
  return (hit || displays[0]).id;
}

export class Tico {
  constructor(api, settings = DEFAULTS, apps = DEFAULT_APPS) {
    this.apps = apps;
    this.api = api;
    this.settings = settings;
    this.state = null;
    this.displays = [];
    this.windows = new Map();
    this.queue = Promise.resolve();
  }

  // Run one step at a time: events arrive faster than Chrome answers, and
  // each step reads what the one before it did.
  run(step) {
    const done = this.queue.then(step);
    this.queue = done.catch((e) => console.error("tico:", e));
    return done;
  }

  // Something changed outside tico: a window opened, closed, moved or took
  // focus, or a display came or went.
  event() {
    return this.run(async () => {
      await this.sync();
      await this.apply();
    });
  }

  command(name) {
    return this.run(async () => {
      await this.sync();
      const focus = await this.perform(name);
      await this.apply(focus);
    });
  }

  async load() {
    if (this.state) return;
    const stored = await this.api.storage.local.get(STATE_KEY);
    this.state = stored[STATE_KEY] || null;
  }

  async save() {
    await this.api.storage.local.set({ [STATE_KEY]: this.state, [VIEW_KEY]: this.view() });
  }

  // What the popup and home window show: each display's workspace and
  // layout, and how many windows each workspace holds.
  view() {
    const s = this.state;
    const displays = {};
    for (const d of this.displays) {
      const n = ws.showing(s, d.id);
      displays[d.id] = { workspace: n, mode: n === null ? null : this.modeOf(n, d) };
    }
    const counts = {};
    for (let n = 1; n <= ws.WORKSPACES; n++) counts[n] = s.workspaces[n].windows.length;
    return { focusedDisplay: this.focusedDisplay() ?? null, displays, counts };
  }

  // Bring the state up to date with Chrome: displays, new and closed
  // windows, and what you did to windows yourself since the last step.
  async sync() {
    await this.load();
    this.displays = await this.api.system.display.getInfo();
    const ids = this.displays.map((d) => d.id);
    // The state as the last step left the screen, before displays changed.
    const before = this.state;
    let s = before ? ws.setDisplays(before, ids) : ws.create(ids);
    const appPopups = new Set((before?.appPopups ?? []).map(Number));

    // Every window type, so a focused popup or devtools window still says
    // which display you're on, but only managed ones are tracked.
    const all = await this.api.windows.getAll({ populate: true, windowTypes: [...MANAGED, "popup", "devtools"] });
    const wins = all.filter((w) => MANAGED.includes(w.type) || appPopups.has(w.id));
    this.windows = new Map(wins.map((w) => [w.id, w]));
    this.all = new Map(all.map((w) => [w.id, w]));
    for (const id of Object.keys(s.windows).map(Number)) {
      if (!this.windows.has(id)) s = ws.removeWindow(s, id);
    }
    const focusedDisplay = this.focusedDisplay();
    // After every step the screen matches the state, so a mismatch now is
    // something you did. Judge each window against the state the last step
    // left, before any display came or went and before this sync changed
    // anything, so neither a new display nor one restore that brings a
    // workspace makes other windows look minimized or restored.
    for (const w of wins) {
      if (!(w.id in s.windows) || !before || !(w.id in before.windows)) {
        s = ws.addWindow(s, w.id, displayFor(w, this.displays), { floating: !!w.alwaysOnTop });
        // A window already minimized when tico first sees it stays so.
        if (w.state === "minimized") s = ws.userMinimized(s, w.id);
        if (w.focused) s = ws.focused(s, w.id);
        continue;
      }
      const minimized = w.state === "minimized";
      const shouldShow = ws.isShown(before, w.id);
      if (minimized && shouldShow) s = ws.userMinimized(s, w.id);
      else if (!minimized && !shouldShow) s = ws.userRestored(s, w.id, focusedDisplay);
      else if (!minimized && w.state === "normal") {
        // A window ChromeOS moved off a display that's gone wasn't dragged;
        // its workspace just hides.
        const was = ws.displayOf(before, before.windows[w.id].ws);
        const d = displayFor(w, this.displays);
        if (was !== null && ids.includes(was) && was !== d) s = ws.movedToDisplay(s, w.id, d);
      }
      if (w.focused) s = ws.focused(s, w.id);
    }
    s.appPopups = [...appPopups].filter((id) => this.windows.has(id));
    s.homes = {};
    for (const [d, id] of Object.entries(this.state?.homes ?? {})) {
      if (!this.all.has(id)) continue;
      if (ids.includes(d)) s.homes[d] = id;
      // ChromeOS moves a gone display's home onto another, where nothing
      // would ever close it.
      else await this.api.windows.remove(id);
    }
    this.state = s;
  }

  // The display of the focused window, any type: a home window or a popup
  // counts, so keys pressed there act on its display.
  focusedDisplay() {
    const f = [...(this.all?.values() ?? [])].find((w) => w.focused && w.state !== "minimized");
    return f ? displayFor(f, this.displays) : this.displays[0]?.id;
  }

  focusedWindow() {
    for (const w of this.windows.values()) if (w.focused) return w.id;
    return null;
  }

  modeOf(n, display) {
    const layout = this.state.workspaces[n].layout;
    if (layout) return layout;
    const a = display.workArea;
    return a.width / a.height >= this.settings.ultrawideAspect ? "threecol" : "tile";
  }

  // A floating window keeps its size and its place relative to its display,
  // but moves with its workspace when that shows on another display, so
  // every shown window is on its workspace's display and the next sync
  // doesn't read the difference as a drag.
  async placeFloating(update) {
    const s = this.state;
    for (const [key, info] of Object.entries(s.windows)) {
      const id = Number(key);
      const w = this.windows.get(id);
      if (!info.floating || !w || w.state !== "normal" || !ws.isShown(s, id)) continue;
      const target = this.displays.find((d) => d.id === ws.displayOf(s, info.ws));
      const source = this.displays.find((d) => d.id === displayFor(w, this.displays));
      if (!target || !source || target.id === source.id) continue;
      const t = target.workArea;
      const from = source.workArea;
      const width = Math.min(w.width, t.width);
      const height = Math.min(w.height, t.height);
      const left = Math.min(Math.max(t.left + (w.left - from.left), t.left), t.left + t.width - width);
      const top = Math.min(Math.max(t.top + (w.top - from.top), t.top), t.top + t.height - height);
      await update(id, { left, top, width, height });
    }
  }

  // Apply a command to the state. Returns the window to focus, if any.
  async perform(name) {
    const s = this.state;
    const display = this.focusedDisplay();
    const n = ws.showing(s, display);
    const win = this.focusedWindow();
    const tracked = win !== null && win in s.windows;
    const step = (k) => ((((n ?? 1) - 1 + k) % ws.WORKSPACES) + ws.WORKSPACES) % ws.WORKSPACES + 1;
    const disp = this.displays.find((d) => d.id === display);
    const mode = n === null || !disp ? null : this.modeOf(n, disp);

    let m;
    if ((m = name.match(/^workspace-([1-9])$/))) return this.showWorkspace(display, Number(m[1]));
    if (name === "workspace-next") return this.showWorkspace(display, step(1));
    if (name === "workspace-prev") return this.showWorkspace(display, step(-1));
    if (name === "popup") return this.popup(display);
    if (name === "app-browser") return this.browser(display, n);
    const app = this.apps.find((a) => a.command === name);
    if (app) return this.app(app, display);
    if (!tracked && name !== "layout-next" && name !== "layout-prev") return null;

    if ((m = name.match(/^send-([1-9])$/))) this.state = ws.send(s, win, Number(m[1]));
    else if (name === "send-next") this.state = ws.send(s, win, step(1));
    else if (name === "send-prev") this.state = ws.send(s, win, step(-1));
    else if (name === "focus-next") return ws.neighbor(s, win, 1);
    else if (name === "focus-prev") return ws.neighbor(s, win, -1);
    else if (name === "move-next") this.state = ws.moveInStack(s, win, 1);
    else if (name === "move-prev") this.state = ws.moveInStack(s, win, -1);
    else if (name === "swap-master") this.state = ws.swapMaster(s, win);
    else if (name === "float") this.state = ws.toggleFloating(s, win);
    else if (n === null || mode === null) return null;
    else if (name === "grow") this.state = ws.adjust(s, n, mode, { mfact: 0.025 });
    else if (name === "shrink") this.state = ws.adjust(s, n, mode, { mfact: -0.025 });
    else if (name === "master-add") this.state = ws.adjust(s, n, mode, { nmaster: 1 });
    else if (name === "master-remove") this.state = ws.adjust(s, n, mode, { nmaster: -1 });
    else if (name === "monocle") this.state = ws.toggleMonocle(s, n, mode);
    else if (name === "layout-next" || name === "layout-prev") {
      const i = geometry.modes.indexOf(mode);
      const k = name === "layout-next" ? 1 : -1;
      this.state = ws.setLayout(s, n, geometry.modes[(i + k + geometry.modes.length) % geometry.modes.length]);
    }
    return null;
  }

  // The toolbar badge shows the focused display's workspace (§8.1).
  async badge() {
    const n = ws.showing(this.state, this.focusedDisplay());
    await this.api.action?.setBadgeText({ text: n === null ? "" : String(n) });
  }

  // The popup, from the toolbar where there is one. A web app window has no
  // toolbar, and Chrome refuses to open the popup there, so it opens as a
  // small window instead (§8.1).
  async popup(display) {
    try {
      await this.api.action.openPopup();
      return null;
    } catch {
      // "Browser window has no toolbar": fall through to the window
    }
    const d = this.displays.find((x) => x.id === display) ?? this.displays[0];
    const a = d.workArea;
    // Wide enough for the popup's one row; narrower work areas wrap it.
    const width = Math.min(800, a.width);
    const height = Math.min(160, a.height);
    await this.api.windows.create({
      url: this.api.runtime.getURL("src/popup.html?window=1"),
      type: "popup",
      focused: true,
      left: a.left + Math.round((a.width - width) / 2),
      top: a.top + Math.round((a.height - height) / 2),
      width,
      height,
    });
    return null;
  }

  // Bring up a window, with its workspace (§6.1 Activate).
  activate(id, display) {
    this.state = ws.activate(this.state, id, display);
    return id;
  }

  async open(props, display) {
    const w = await this.api.windows.create({ focused: true, ...props });
    this.windows.set(w.id, w);
    this.state = ws.addWindow(this.state, w.id, display);
    return w;
  }

  // The browser key: the most recently focused browser window on this
  // workspace, else a new one. Every normal window is a browser, whatever
  // its tab shows.
  async browser(display, n) {
    const w = n === null ? null : this.state.workspaces[n];
    const recency = (id) => this.state.windows[id]?.lastFocused ?? 0;
    const found = (w?.windows ?? [])
      .filter((id) => this.windows.get(id)?.type === "normal")
      .sort((a, b) => recency(b) - recency(a))[0];
    if (found !== undefined) return this.activate(found, display);
    return (await this.open({}, display)).id;
  }

  // A web app key: its newest window wherever it is, else a new app window.
  // Only app windows and the popups tico opened for an app count (§9.1).
  async app(app, display) {
    let newest = null;
    for (const w of this.windows.values()) {
      const eligible = w.type === "app" || (w.type === "popup" && this.state.appPopups.includes(w.id));
      // Chrome hands out window IDs in increasing order, so the highest is the newest.
      if (eligible && w.id in this.state.windows && appOf(w, this.apps) === app && (newest === null || w.id > newest)) newest = w.id;
    }
    if (newest !== null) return this.activate(newest, display);
    // Installed web apps open their own windows, but there's no public
    // way to launch one by origin, so tico opens the site in an app-like
    // popup and remembers it as the app's (§9.1).
    const w = await this.open({ url: app.url, type: "popup" }, display);
    this.state.appPopups.push(w.id);
    return w.id;
  }

  // An empty workspace gets a home window, so tico's keys still have a
  // Chrome window to work in (§6.2). It isn't tiled or counted, and closes
  // when a window arrives. One you close stays closed until the display
  // shows another empty workspace.
  async homes(focus) {
    const s = this.state;
    s.homeShownFor ??= {};
    const target = this.switchedTo ?? this.focusedDisplay();
    for (const display of this.displays) {
      const n = ws.showing(s, display.id);
      const empty = n !== null && !s.workspaces[n].windows.some((id) => ws.isShown(s, id));
      const home = s.homes[display.id];
      // Only one display's home may take focus: the one you switched, else
      // the one you're on.
      const wantFocus = focus === null && display.id === target;
      if (!empty) delete s.homeShownFor[display.id];
      if (empty && home === undefined && s.homeShownFor[display.id] !== n) {
        s.homeShownFor[display.id] = n;
        const a = display.workArea;
        const width = Math.min(480, a.width);
        const height = Math.min(360, a.height);
        const w = await this.api.windows.create({
          url: this.api.runtime.getURL("src/home.html"),
          type: "popup",
          focused: wantFocus,
          left: a.left + Math.round((a.width - width) / 2),
          top: a.top + Math.round((a.height - height) / 2),
          width,
          height,
        });
        s.homes[display.id] = w.id;
      } else if (!empty && home !== undefined) {
        delete s.homes[display.id];
        await this.api.windows.remove(home);
      } else if (empty && home !== undefined) {
        s.homeShownFor[display.id] = n;
        if (wantFocus && this.switchedTo !== undefined) await this.api.windows.update(home, { focused: true });
      }
    }
    this.switchedTo = undefined;
  }

  showWorkspace(display, n) {
    if (display === undefined) return null;
    this.switchedTo = display;
    this.state = ws.show(this.state, display, n);
    const w = this.state.workspaces[n];
    // The remembered window, unless you've minimized it since.
    const remembered = w.focused !== null && ws.isShown(this.state, w.focused) ? w.focused : null;
    return remembered ?? ws.tiled(this.state, display)[0] ?? null;
  }

  // Make the screen match the state, then save it.
  async apply(focus = null) {
    const s = this.state;
    const minimizedNow = new Set([...this.windows.values()].filter((w) => w.state === "minimized").map((w) => w.id));
    const { restore, minimize } = ws.plan(s, minimizedNow);
    // Keep the snapshot current with what each update returns, so every
    // later step in this apply sees a restored window as restored.
    const update = async (id, props) => {
      const w = await this.api.windows.update(id, props);
      if (w && this.windows.has(id)) this.windows.set(id, w);
      return w;
    };
    for (const id of restore) await update(id, { state: "normal" });
    for (const id of minimize) await update(id, { state: "minimized" });

    for (const display of this.displays) {
      const n = ws.showing(s, display.id);
      if (n === null) continue;
      // Maximized and fullscreen windows are left alone (§5.1).
      const ids = ws.tiled(s, display.id).filter((id) => this.windows.get(id)?.state === "normal");
      const mode = this.modeOf(n, display);
      const boxes = geometry.arrange(mode, area(display), ids.length, s.workspaces[n].modes[mode], this.settings.singleRules);
      await Promise.all(ids.map((id, i) => {
        const b = boxes[i];
        return update(id, { left: b.x, top: b.y, width: b.w, height: b.h });
      }));
    }
    await this.placeFloating(update);
    if (focus !== null) {
      await update(focus, { focused: true });
      this.state = ws.focused(this.state, focus);
    }
    await this.homes(focus);
    await this.badge();
    await this.save();
  }
}
