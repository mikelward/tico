// The home window on an empty workspace (SPEC.md §6.2): which workspace it
// is, the clocks, and the keys that still work from here.

import { renderClocks } from "./clockview.js";

const KEYS = [
  ["Search+G", "Browser"],
  ["Search+C", "Google Calendar"],
  ["Search+Shift+C", "Google Chat"],
  ["Search+M", "Google Meet"],
  ["Search+Y", "YouTube Music"],
  ["Search+1…9", "Go to a workspace"],
];

function render(state) {
  chrome.windows.getCurrent().then((me) => {
    const display = Object.entries(state?.homes ?? {}).find(([, id]) => id === me.id)?.[0];
    const n = display === undefined ? "" : state.displays[display];
    document.getElementById("workspace").textContent = n ?? "";
  });
}

const keys = document.getElementById("keys");
for (const [key, what] of KEYS) {
  const dt = document.createElement("dt");
  dt.textContent = key;
  const dd = document.createElement("dd");
  dd.textContent = what;
  keys.append(dt, dd);
}

chrome.storage.local.get("state").then(({ state }) => render(state));
chrome.storage.onChanged.addListener((changes) => {
  if (changes.state) render(changes.state.newValue);
});

const clocks = document.getElementById("clocks");
renderClocks(clocks);
setInterval(() => renderClocks(clocks), 10000);
