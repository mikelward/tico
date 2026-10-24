// The clocks (SPEC.md §8.2), following tide's rules: fixed place labels,
// 24-hour times, a zone that is the local zone hidden, and ±1 on a zone
// whose date differs from local.

export const DEFAULT_CLOCKS = [
  { zone: "America/Los_Angeles", label: "SF" },
  { zone: "America/New_York", label: "NYC" },
  { zone: "Europe/London", label: "LON" },
];

function parts(date, zone) {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), time: `${p.hour}:${p.minute}` };
}

// Whole days from local's date to the zone's date: -1, 0 or +1 (±2 only
// across the date line).
function dayOffset(a, b) {
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86400000);
}

// A bad zone is an error naming it, so settings can report it at load.
export function checkZone(zone) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
  } catch {
    throw new Error(`unknown time zone: ${zone}`);
  }
}

// The clock row: each listed zone, then local with its date in place of a
// label. `clocks` is a list of {zone, label}.
export function clockRow(date, localZone, clocks = DEFAULT_CLOCKS, { dedupeLocal = true } = {}) {
  const local = parts(date, localZone);
  const rows = [];
  for (const c of clocks) {
    if (dedupeLocal && c.zone === localZone) continue;
    const p = parts(date, c.zone);
    rows.push({ label: c.label, time: p.time, day: dayOffset(local, p) });
  }
  const month = new Intl.DateTimeFormat("en-US", { timeZone: localZone, month: "short" }).format(date);
  rows.push({ label: `${month} ${local.d}`, time: local.time, day: 0, local: true });
  return rows;
}

// The offset from UTC of `zone` at `date`, in minutes.
export function offsetMinutes(date, zone) {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "longOffset" })
    .formatToParts(date)
    .find((p) => p.type === "timeZoneName").value;
  const m = name.match(/GMT([+-])(\d{2}):(\d{2})/);
  if (!m) return 0;
  return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
}

// The next time `zone`'s offset changes after `date`, to the minute, within
// a year, or null.
export function nextOffsetChange(date, zone) {
  const start = offsetMinutes(date, zone);
  const hour = 3600000;
  let t = date.getTime();
  for (let i = 0; i < 366 * 24; i++) {
    const next = t + hour;
    if (offsetMinutes(new Date(next), zone) !== start) {
      let lo = t;
      let hi = next;
      while (hi - lo > 60000) {
        const mid = lo + Math.floor((hi - lo) / 120000) * 60000;
        if (offsetMinutes(new Date(mid), zone) === start) lo = mid;
        else hi = mid;
      }
      return new Date(hi);
    }
    t = next;
  }
  return null;
}
