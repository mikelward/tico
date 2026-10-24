// The clocks as HTML, shared by the popup and the home window: the row, and
// the popup's detail with each zone's strip and the next DST change
// (SPEC.md §8.2).

import {
  abbreviation,
  city,
  clockRow,
  DEFAULT_CLOCKS,
  dstNote,
  formatOffset,
  hoursFromLocal,
  localHour,
  strip,
} from "./clocks.js";

const localZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

// `scrubbed` marks a time you've scrolled to rather than now.
export function renderClocks(ol, now = new Date(), scrubbed = false) {
  ol.replaceChildren();
  ol.classList.toggle("scrubbed", scrubbed);
  for (const c of clockRow(now, localZone(), DEFAULT_CLOCKS)) {
    const li = el("li");
    li.append(el("span", "label", c.label), c.time);
    if (c.day !== 0) li.append(el("sup", null, c.day > 0 ? `+${c.day}` : `−${-c.day}`));
    ol.append(li);
  }
}

export function renderDetail(section, now = new Date(), scrubbed = false) {
  const local = localZone();
  section.replaceChildren();
  section.classList.toggle("scrubbed", scrubbed);
  const times = clockRow(now, local, DEFAULT_CLOCKS);
  const zones = [...DEFAULT_CLOCKS.filter((c) => c.zone !== local), { zone: local, label: "—", city: "Local" }];
  const nowAt = `${(localHour(now, local) / 24) * 100}%`;
  zones.forEach((c, i) => {
    section.append(el("span", "label", c.label));
    const name = el("span", "city", city(c));
    name.append(" ", el("span", "abbr", abbreviation(now, c.zone)));
    section.append(name, el("span", "time", times[i].time));
    const bar = el("div", "strip");
    for (const s of strip(now, local, c.zone)) {
      const seg = el("div", s.kind);
      seg.style.left = `${(s.start / 24) * 100}%`;
      seg.style.width = `${((s.end - s.start) / 24) * 100}%`;
      bar.append(seg);
    }
    const line = el("div", "now");
    line.style.left = nowAt;
    bar.append(line);
    section.append(bar, el("span", "offset", c.zone === local ? "" : formatOffset(hoursFromLocal(now, local, c.zone))));
  });
  const axis = el("div", "axis");
  for (const h of [0, 6, 12, 18, 24]) axis.append(el("span", null, String(h)));
  section.append(axis);
  const note = dstNote(now, local, DEFAULT_CLOCKS);
  if (note) {
    const p = el("p", "note");
    p.append(el("strong", null, "Clocks change soon. "), note);
    section.append(p);
  }
}
