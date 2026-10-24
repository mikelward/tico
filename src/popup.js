// tico's popup (SPEC.md §8): the nine workspaces in tide's bar style, the
// layout, and the clocks. Opened as a window where there's no toolbar, it
// closes when it loses focus.

import { renderClocks } from "./clockview.js";

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
const clocks = document.getElementById("clocks");
renderClocks(clocks);
setInterval(() => renderClocks(clocks), 10000);
if (asWindow) {
  window.addEventListener("blur", () => window.close());
  window.addEventListener("keydown", (e) => e.key === "Escape" && window.close());
}
