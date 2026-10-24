// Settings (SPEC.md §13): the shared ones in chrome.storage.sync, per-machine
// overrides in chrome.storage.local, merged key by key. A bad value is an
// error naming the setting, and that setting keeps its default.

import { checkZone, DAY, DEFAULT_CLOCKS, WORK } from "./clocks.js";

export const SETTINGS_KEY = "settings";

export const DEFAULT_SETTINGS = {
  clocks: DEFAULT_CLOCKS,
  day: DAY,
  work: WORK,
};

function checkClocks(clocks) {
  if (!Array.isArray(clocks)) throw new Error("must be a list");
  return clocks.map((c, i) => {
    const at = `clock ${i + 1}`;
    if (typeof c !== "object" || c === null) throw new Error(`${at} must be an object`);
    if (typeof c.zone !== "string" || !c.zone) throw new Error(`${at} has no zone`);
    try {
      checkZone(c.zone);
    } catch (e) {
      throw new Error(`${at}: ${e.message}`);
    }
    const label = typeof c.label === "string" ? c.label.trim() : "";
    if (!label) throw new Error(`${at} has no label`);
    if (label.length > 4) throw new Error(`${at}'s label "${label}" is longer than 4 letters`);
    const clock = { zone: c.zone, label };
    if (typeof c.city === "string" && c.city.trim()) clock.city = c.city.trim();
    return clock;
  });
}

function checkHours(hours) {
  if (!Array.isArray(hours) || hours.length !== 2 || !hours.every((h) => Number.isInteger(h))) {
    throw new Error("must be two whole hours, like [9, 17]");
  }
  const [from, to] = hours;
  if (from < 0 || to > 24 || from >= to) throw new Error(`${from}–${to} isn't a span within 0–24`);
  return [from, to];
}

const CHECKS = { clocks: checkClocks, day: checkHours, work: checkHours };

// Settings from what's stored: `sync` then `local`, each an object or
// undefined. Returns {settings, errors}, an error for each bad or unknown
// setting, which keeps its default.
export function resolve(sync, local) {
  const settings = structuredClone(DEFAULT_SETTINGS);
  const errors = [];
  for (const source of [sync, local]) {
    if (source === undefined || source === null) continue;
    if (typeof source !== "object" || Array.isArray(source)) {
      errors.push("settings must be an object");
      continue;
    }
    for (const [key, value] of Object.entries(source)) {
      if (!(key in CHECKS)) {
        errors.push(`unknown setting: ${key}`);
        continue;
      }
      try {
        settings[key] = CHECKS[key](value);
      } catch (e) {
        errors.push(`${key}: ${e.message}`);
      }
    }
  }
  return { settings, errors };
}

// The settings as stored for this machine. `storage` is chrome.storage.
export async function load(storage) {
  const [sync, local] = await Promise.all([storage.sync.get(SETTINGS_KEY), storage.local.get(SETTINGS_KEY)]);
  return resolve(sync[SETTINGS_KEY], local[SETTINGS_KEY]);
}
