// tico's full-screen page (SPEC.md §6.2, §8.1, §9.4): tide's bar on top,
// with a launcher under it. As the home page of an empty workspace it opens
// on the launch scope and stays; as the dashboard, from its key or the
// toolbar button, it opens on open tabs and closes once you choose.

import { scrub } from "./clocks.js";
import { renderClocks, renderDetail } from "./clockview.js";
import { items, rank } from "./launcher.js";

const SYMBOLS = { tile: "[]=", threecol: "|M|", twocol: "||=", monocle: "[M]" };
const mode = new URLSearchParams(location.search).get("mode") === "home" ? "home" : "dashboard";
const home = mode === "home";
const $ = (id) => document.getElementById(id);
const query = $("query");
const results = $("results");
const clocks = $("clocks");
const detail = $("clock-detail");

let scope = home ? "launch" : "tabs";
let all = [];
let shown = [];
let selected = 0;
let state = null;
let view = null;
let me = null;

// After a choice the dashboard closes; the home page stays until a window
// arrives on its workspace, which closes it.
async function send(message) {
  await chrome.runtime.sendMessage(message);
  if (home) {
    query.value = "";
    update();
  } else window.close();
}

function renderBar() {
  const nav = $("workspaces");
  nav.replaceChildren();
  if (!view) return;
  // The home page belongs to its own display; the dashboard has focus.
  const display = home
    ? Object.entries(state?.homes ?? {}).find(([, id]) => id === me?.id)?.[0]
    : view.focusedDisplay;
  const here = view.displays[display];
  const elsewhere = new Set(
    Object.entries(view.displays)
      .filter(([id]) => id !== display)
      .map(([, d]) => d.workspace),
  );
  for (let n = 1; n <= 9; n++) {
    const b = document.createElement("button");
    b.textContent = n;
    if (view.counts[n] > 0) b.classList.add("occupied");
    if (elsewhere.has(n)) b.classList.add("elsewhere");
    if (view.urgent?.includes(n)) b.classList.add("urgent");
    if (here?.workspace === n) b.classList.add("current");
    b.addEventListener("click", () => send({ command: `workspace-${n}` }));
    nav.append(b);
  }
  const layout = document.createElement("span");
  layout.className = "layout";
  layout.textContent = SYMBOLS[here?.mode] ?? "";
  nav.append(layout);
  $("title").textContent = here?.workspace ? `Workspace ${here.workspace}${home ? " · empty" : ""}` : "";
  $("dim").checked = !!view.dim;
}

async function refresh() {
  me = await chrome.windows.getCurrent();
  const [tabs, stored] = await Promise.all([chrome.tabs.query({}), chrome.storage.local.get(["state", "view"])]);
  state = stored.state ?? null;
  view = stored.view ?? null;
  const commands = chrome.runtime.getManifest().commands;
  const apps = Object.entries(commands)
    .filter(([name]) => name.startsWith("app-"))
    .map(([command, c]) => {
      const m = /^Focus or open (?:a )?(.*?)\s*\((.*)\)$/.exec(c.description);
      const name = m ? m[1][0].toUpperCase() + m[1].slice(1) : command;
      return { name, command, key: m ? m[2] : "" };
    });
  all = items({
    tabs,
    apps,
    commands,
    workspaceOf: (w) => state?.windows?.[w]?.ws ?? null,
    ownOrigin: chrome.runtime.getURL(""),
  });
  renderBar();
  update();
}

function update() {
  shown = rank(query.value, all, { scope });
  selected = Math.min(selected, Math.max(shown.length - 1, 0));
  for (const b of document.querySelectorAll(".scopes button")) {
    b.setAttribute("aria-selected", String(b.dataset.scope === scope));
  }
  results.replaceChildren();
  shown.forEach((item, i) => {
    const li = document.createElement("li");
    li.setAttribute("role", "option");
    li.setAttribute("aria-selected", String(i === selected));
    const icon = document.createElement(item.icon ? "img" : "span");
    icon.className = `icon ${item.kind}`;
    if (item.icon) icon.src = item.icon;
    const title = document.createElement("span");
    title.className = "title";
    title.textContent = item.title;
    const kind = document.createElement("span");
    kind.className = "kind";
    kind.textContent = item.detail;
    const key = document.createElement("span");
    key.className = "key";
    key.textContent = item.key ?? "";
    li.append(icon, title, kind, key);
    li.addEventListener("click", () => choose(item));
    results.append(li);
  });
}

function choose(item) {
  if (!item) return;
  if (item.kind === "tab") send({ tabId: item.tabId, windowId: item.windowId });
  else send({ command: item.command });
}

function setScope(s) {
  scope = s;
  selected = 0;
  update();
  query.focus();
}

query.addEventListener("input", () => {
  selected = 0;
  update();
});
query.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    const n = shown.length;
    if (n) selected = (selected + (e.key === "ArrowDown" ? 1 : n - 1)) % n;
    update();
  } else if (e.key === "Enter") {
    e.preventDefault();
    choose(shown[selected]);
  } else if (e.key === "Tab") {
    // Tab flips the scope; it's Search+Tab, not Tab, that runs attention.
    e.preventDefault();
    setScope(scope === "launch" ? "tabs" : "launch");
  }
});
// Esc anywhere on the page, not just in the search box: after a click on the
// clocks or the dim toggle, focus is elsewhere.
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  e.preventDefault();
  if (query.value) {
    query.value = "";
    update();
    query.focus();
  } else if (!home) window.close();
  else query.focus();
});
for (const b of document.querySelectorAll(".scopes button")) b.addEventListener("click", () => setScope(b.dataset.scope));

// The clocks: the home page shows each zone's day; the dashboard opens it on
// a click. Scrolling over them scrubs time until the pointer leaves (§8.2).
let scrubbed = null;
function renderTime() {
  const at = scrubbed ?? new Date();
  renderClocks(clocks, at, scrubbed !== null);
  if (!detail.hidden) renderDetail(detail, at, scrubbed !== null);
}
function toggleDetail() {
  detail.hidden = !detail.hidden;
  clocks.setAttribute("aria-expanded", String(!detail.hidden));
  renderTime();
}
clocks.addEventListener("click", toggleDetail);
clocks.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" && e.key !== " ") return;
  e.preventDefault();
  toggleDetail();
});
for (const e of [clocks, detail]) {
  e.addEventListener("wheel", (event) => {
    event.preventDefault();
    scrubbed = scrub(scrubbed ?? new Date(), Math.sign(event.deltaY));
    renderTime();
  }, { passive: false });
}
document.body.addEventListener("mouseleave", () => {
  scrubbed = null;
  renderTime();
});

// The dim needs all-sites access (§10.1), asked for here because Chrome only
// prompts on a click. Turning it off undims every page first, then gives the
// access back.
const DIM_ORIGINS = ["<all_urls>"];
const dim = $("dim");
dim.addEventListener("change", async () => {
  if (dim.checked) {
    if (await chrome.permissions.request({ origins: DIM_ORIGINS })) await chrome.runtime.sendMessage({ dim: true });
    else dim.checked = false;
  } else if (await chrome.runtime.sendMessage({ dim: false })) {
    await chrome.permissions.remove({ origins: DIM_ORIGINS });
  }
});

if (home) {
  document.body.classList.add("home");
  detail.hidden = false;
  clocks.setAttribute("aria-expanded", "true");
} else {
  $("esc").textContent = "clear or close";
  // The dashboard is a glance: clicking away closes it.
  window.addEventListener("blur", () => window.close());
}

chrome.storage.onChanged.addListener((changes) => {
  if (changes.view || changes.state) refresh();
});
// The home page can sit for hours; look again whenever it comes back.
window.addEventListener("focus", () => {
  refresh();
  query.focus();
});
refresh();
renderTime();
setInterval(renderTime, 10000);
query.focus();
