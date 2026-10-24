// The clock row as HTML, shared by the popup and the home window.

import { clockRow, DEFAULT_CLOCKS } from "./clocks.js";

export function renderClocks(ol, now = new Date()) {
  ol.replaceChildren();
  const local = Intl.DateTimeFormat().resolvedOptions().timeZone;
  for (const c of clockRow(now, local, DEFAULT_CLOCKS)) {
    const li = document.createElement("li");
    const label = document.createElement("span");
    label.className = "label";
    label.textContent = c.label;
    li.append(label, c.time);
    if (c.day !== 0) {
      const sup = document.createElement("sup");
      sup.textContent = c.day > 0 ? `+${c.day}` : `\u2212${-c.day}`;
      li.append(sup);
    }
    ol.append(li);
  }
}
