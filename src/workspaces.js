// The workspace state machine (SPEC.md §6.1), free of any chrome.* API.
//
// One rule decides what's on screen: a window is shown if and only if its
// workspace is showing on some display and you haven't minimized it. Every
// operation here changes only the state and returns a new one; plan() then
// says which windows to restore and minimize to make the screen match.

export const WORKSPACES = 9;

export const DEFAULT_MODE_SETTINGS = {
  tile: { mfact: 0.55, nmaster: 1 },
  threecol: { mfact: 0.5, nmaster: 1 },
  twocol: { mfact: 0.72, nmaster: 2 },
  monocle: { mfact: 0.5, nmaster: 1 },
};

function emptyWorkspace() {
  return { windows: [], layout: null, modes: structuredClone(DEFAULT_MODE_SETTINGS), focused: null };
}

function clone(state) {
  return structuredClone(state);
}

// A fresh state for `displayIds`: display i shows workspace i + 1.
export function create(displayIds) {
  const state = { displays: {}, workspaces: {}, windows: {} };
  for (let n = 1; n <= WORKSPACES; n++) state.workspaces[n] = emptyWorkspace();
  return setDisplays(state, displayIds);
}

// The workspace showing on `displayId`, or null.
export function showing(state, displayId) {
  return state.displays[displayId] ?? null;
}

// The display showing workspace `n`, or null.
export function displayOf(state, n) {
  for (const [id, shown] of Object.entries(state.displays)) if (shown === n) return id;
  return null;
}

function lowestHidden(state) {
  const shown = new Set(Object.values(state.displays));
  for (let n = 1; n <= WORKSPACES; n++) if (!shown.has(n)) return n;
  return null;
}

// Displays came or went. A display that stays keeps its workspace; a new one
// shows the lowest workspace not showing; a gone one's workspace hides.
export function setDisplays(state, displayIds) {
  const s = clone(state);
  const keep = {};
  for (const id of displayIds) if (id in s.displays) keep[id] = s.displays[id];
  s.displays = keep;
  for (const id of displayIds) if (!(id in s.displays)) s.displays[id] = lowestHidden(s);
  return s;
}

function detach(s, winId) {
  const w = s.windows[winId];
  if (!w) return;
  const ws = s.workspaces[w.ws];
  ws.windows = ws.windows.filter((id) => id !== winId);
  if (ws.focused === winId) ws.focused = null;
}

function attach(s, winId, n) {
  s.workspaces[n].windows.push(winId);
  s.windows[winId] = { ...(s.windows[winId] || { minimizedByYou: false, floating: false }), ws: n };
}

// A new window joins the end of the stack of the workspace showing on the
// display it opened on.
export function addWindow(state, winId, displayId, { floating = false } = {}) {
  if (winId in state.windows) return state;
  const s = clone(state);
  const n = showing(s, displayId) ?? 1;
  attach(s, winId, n);
  s.windows[winId].floating = floating;
  return s;
}

// A floating window belongs to its workspace, showing and hiding with it,
// but never takes a tile.
export function toggleFloating(state, winId) {
  if (!(winId in state.windows)) return state;
  const s = clone(state);
  s.windows[winId].floating = !s.windows[winId].floating;
  return s;
}

export function removeWindow(state, winId) {
  if (!(winId in state.windows)) return state;
  const s = clone(state);
  detach(s, winId);
  delete s.windows[winId];
  return s;
}

// Show workspace `n` on `displayId`. If `n` was showing on another display,
// that display takes this one's old workspace: a swap, as in tide.
export function show(state, displayId, n) {
  const s = clone(state);
  const old = s.displays[displayId];
  const other = displayOf(s, n);
  if (other !== null && other !== String(displayId)) s.displays[other] = old;
  s.displays[displayId] = n;
  return s;
}

// Send a window to the end of workspace `n`'s stack. Whether it's then shown
// depends only on whether `n` is showing.
export function send(state, winId, n) {
  if (!(winId in state.windows) || state.windows[winId].ws === n) return state;
  const s = clone(state);
  // The focused window stays the one focused where it lands: moving it
  // need not bring another focus event.
  const wasFocused = s.workspaces[s.windows[winId].ws].focused === winId;
  detach(s, winId);
  attach(s, winId, n);
  if (wasFocused) s.workspaces[n].focused = winId;
  return s;
}

// Bring a window up: show its workspace on the focused display if it isn't
// showing anywhere, clear its minimized-by-you flag, and focus it there.
export function activate(state, winId, focusedDisplayId) {
  if (!(winId in state.windows)) return state;
  let s = clone(state);
  const n = s.windows[winId].ws;
  if (displayOf(s, n) === null) s = show(s, focusedDisplayId, n);
  s.windows[winId].minimizedByYou = false;
  s.workspaces[n].focused = winId;
  return s;
}

export function userMinimized(state, winId) {
  if (!(winId in state.windows)) return state;
  const s = clone(state);
  s.windows[winId].minimizedByYou = true;
  return s;
}

// Any un-minimize tileco didn't cause. On a hidden workspace this is Activate.
export function userRestored(state, winId, focusedDisplayId) {
  return activate(state, winId, focusedDisplayId);
}

// You moved a window to another display (the native shortcut, or a drag): it
// joins the workspace showing there.
export function movedToDisplay(state, winId, displayId) {
  const n = showing(state, displayId);
  if (n === null) return state;
  return send(state, winId, n);
}

export function focused(state, winId) {
  if (!(winId in state.windows)) return state;
  const s = clone(state);
  s.workspaces[s.windows[winId].ws].focused = winId;
  // A focus counter, so keys can pick the most recently focused of a kind
  // (§9.1); a repeat sync of the same focus doesn't count.
  s.focusSeq ??= 0;
  if (s.windows[winId].lastFocused !== s.focusSeq) s.windows[winId].lastFocused = ++s.focusSeq;
  return s;
}

// Whether `winId` should be on screen, by the one rule.
export function isShown(state, winId) {
  const w = state.windows[winId];
  return !!w && !w.minimizedByYou && displayOf(state, w.ws) !== null;
}

// What to do to make the screen match the rule, given which windows are
// minimized now. Restore first, in tile order, then minimize, so the screen
// never goes empty in between.
export function plan(state, minimizedNow) {
  const restore = [];
  const minimize = [];
  for (let n = 1; n <= WORKSPACES; n++) {
    for (const id of state.workspaces[n].windows) {
      const shown = isShown(state, id);
      const isMin = minimizedNow.has(id);
      if (shown && isMin) restore.push(id);
      if (!shown && !isMin) minimize.push(id);
    }
  }
  return { restore, minimize };
}

function tileable(state, id) {
  const w = state.windows[id];
  return !w.minimizedByYou && !w.floating;
}

// The tiled windows of the workspace showing on `displayId`, in tile order.
export function tiled(state, displayId) {
  const n = showing(state, displayId);
  if (n === null) return [];
  return state.workspaces[n].windows.filter((id) => tileable(state, id));
}

// Stack operations on the workspace holding `winId`.

function withStack(state, winId, fn) {
  if (!(winId in state.windows) || !tileable(state, winId)) return state;
  const s = clone(state);
  const ws = s.workspaces[s.windows[winId].ws];
  // Reorder only the tiled windows, each into a slot a tiled window held,
  // so minimized and floating windows keep their places in the stack.
  const slots = [];
  ws.windows.forEach((id, i) => tileable(s, id) && slots.push(i));
  const list = slots.map((i) => ws.windows[i]);
  fn(list, list.indexOf(winId)).forEach((id, k) => (ws.windows[slots[k]] = id));
  return s;
}

// The window `step` places from `winId` in its stack, wrapping.
export function neighbor(state, winId, step) {
  const w = state.windows[winId];
  if (!w) return null;
  const list = state.workspaces[w.ws].windows.filter((id) => tileable(state, id));
  const i = list.indexOf(winId);
  if (i < 0 || list.length === 0) return null;
  return list[(i + step + list.length) % list.length];
}

// Move `winId` `step` places along its stack, wrapping.
export function moveInStack(state, winId, step) {
  return withStack(state, winId, (list, i) => {
    const j = (i + step + list.length) % list.length;
    [list[i], list[j]] = [list[j], list[i]];
    return list;
  });
}

// Swap `winId` with the master; the master swaps with the next window.
export function swapMaster(state, winId) {
  return withStack(state, winId, (list, i) => {
    const j = i === 0 ? 1 : 0;
    if (j >= list.length) return list;
    [list[i], list[j]] = [list[j], list[i]];
    return list;
  });
}

// Per-workspace layout settings. `mode` null means the display's default.

export function setLayout(state, n, mode) {
  const s = clone(state);
  s.workspaces[n].layout = mode;
  return s;
}

// Toggle monocle on workspace `n`, whose layout is `current` now (resolved
// from the display's default, `fallback`, when unset). Leaving monocle goes
// back to the layout before it, or to tile when that was a monocle default,
// as tide does.
export function toggleMonocle(state, n, current, fallback) {
  const s = clone(state);
  const w = s.workspaces[n];
  if (current === "monocle") {
    w.layout = w.beforeMonocle ?? (fallback === "monocle" ? "tile" : null);
    delete w.beforeMonocle;
  } else {
    w.beforeMonocle = w.layout;
    w.layout = "monocle";
  }
  return s;
}

// Every workspace takes `modes`, each mode's main share and count from the
// settings, dropping what the keys gave it (§5.2, tide's §6). `modesFrom`
// remembers them, so tileco applies a change once rather than on every step.
export function setModes(state, modes) {
  const s = clone(state);
  for (let n = 1; n <= WORKSPACES; n++) s.workspaces[n].modes = structuredClone(modes);
  s.modesFrom = structuredClone(modes);
  return s;
}

export function adjust(state, n, mode, change) {
  const s = clone(state);
  const m = s.workspaces[n].modes[mode];
  if ("mfact" in change) m.mfact = Math.min(0.95, Math.max(0.05, m.mfact + change.mfact));
  // Tile alone works with no main window, as in tide.
  if ("nmaster" in change) m.nmaster = Math.max(mode === "tile" ? 0 : 1, m.nmaster + change.nmaster);
  return s;
}

// A main share you set by dragging a window's edge (§5.3), within the
// bounds the keys keep to.
export function setMfact(state, n, mode, mfact) {
  const s = clone(state);
  s.workspaces[n].modes[mode].mfact = Math.min(0.95, Math.max(0.05, mfact));
  return s;
}

// After a browser restart (§14.2), each window in `renames` (old ID to new)
// keeps its workspace, place in the stack, and everything else tileco knows.
export function renameWindows(state, renames) {
  const s = clone(state);
  for (const [from, to] of renames) {
    if (!(from in s.windows) || to in s.windows) continue;
    s.windows[to] = s.windows[from];
    delete s.windows[from];
    for (const w of Object.values(s.workspaces)) {
      w.windows = w.windows.map((id) => (id === from ? to : id));
      if (w.focused === from) w.focused = to;
    }
  }
  return s;
}
