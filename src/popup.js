// tico's popup (SPEC.md §8): the nine workspaces in tide's bar style, the
// layout, and the clocks. Opened as a window where there's no toolbar, it
// closes when it loses focus.

import { scrub } from "./clocks.js";
import { renderClocks, renderDetail } from "./clockview.js";
import { fitHeight } from "./windowfit.js";

const SYMBOLS = { tile: "[]=", threecol: "|M|", twocol: "||=", monocle: "[M]" };
const asWindow = new URLSearchParams(location.search).has("window");

function renderWorkspaces(view) {
  const nav = document.getElementById("workspaces");
  nav.replaceChildren();
  if (!view) return;
  const here = view.displays[view.focusedDisplay];
  const elsewhere = new Set(
    Object.entries(view.displays)
      .filter(([id]) => id !== view.focusedDisplay)
      .map(([, d]) => d.workspace),
  );
  for (let n = 1; n <= 9; n++) {
    const b = document.createElement("button");
    b.textContent = n;
    if (view.counts[n] > 0) b.classList.add("occupied");
    if (elsewhere.has(n)) b.classList.add("elsewhere");
    if (view.urgent?.includes(n)) b.classList.add("urgent");
    if (here?.workspace === n) b.classList.add("current");
    b.addEventListener("click", () => {
      chrome.runtime.sendMessage({ command: `workspace-${n}` });
      if (asWindow) window.close();
    });
    nav.append(b);
  }
  const layout = document.createElement("span");
  layout.className = "layout";
  layout.textContent = SYMBOLS[here?.mode] ?? "";
  nav.append(layout);
}

const dim = document.getElementById("dim");
function render(view) {
  renderWorkspaces(view);
  dim.checked = !!view?.dim;
}
chrome.storage.local.get("view").then(({ view }) => render(view));
chrome.storage.onChanged.addListener((changes) => {
  if (changes.view) render(changes.view.newValue);
});

// The dim needs all-sites access (§10.1), asked for here because Chrome only
// prompts on a click. Turning it off undims every page first, then gives the
// access back.
const DIM_ORIGINS = ["<all_urls>"];
dim.addEventListener("change", async () => {
  if (dim.checked) {
    if (await chrome.permissions.request({ origins: DIM_ORIGINS })) await chrome.runtime.sendMessage({ dim: true });
    else dim.checked = false;
  } else if (await chrome.runtime.sendMessage({ dim: false })) {
    await chrome.permissions.remove({ origins: DIM_ORIGINS });
  }
});
// The clocks: a click opens each zone's strip and the next DST change, and
// scrolling over them scrubs time until the pointer leaves (§8.2).
const clocks = document.getElementById("clocks");
const detail = document.getElementById("clock-detail");
let scrubbed = null;
function renderTime() {
  const at = scrubbed ?? new Date();
  renderClocks(clocks, at, scrubbed !== null);
  if (!detail.hidden) renderDetail(detail, at, scrubbed !== null);
}
renderTime();
setInterval(renderTime, 10000);
function toggleDetail() {
  detail.hidden = !detail.hidden;
  clocks.setAttribute("aria-expanded", String(!detail.hidden));
  renderTime();
}
clocks.addEventListener("click", toggleDetail);
// It's a button to the keyboard too.
clocks.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  toggleDetail();
});

// Opened as a small window, it fits its content as that changes: the
// detail opening or closing, or a scrub that brings a clock-change note.
async function fit() {
  const me = await chrome.windows.getCurrent();
  const height = fitHeight({
    // The body, not the document, which never measures less than the window.
    content: Math.ceil(document.body.getBoundingClientRect().height),
    outer: me.height,
    inner: window.innerHeight,
    available: screen.availHeight,
  });
  if (height !== me.height) await chrome.windows.update(me.id, { height });
}
if (asWindow) new ResizeObserver(() => fit()).observe(document.body);
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
if (asWindow) {
  window.addEventListener("blur", () => window.close());
  window.addEventListener("keydown", (e) => e.key === "Escape" && window.close());
}
