// Sites watched for unread counts beyond the built-in ones (SPEC.md §10.3).
// The manifest's content script covers Gmail, Chat and Calendar; each site
// the settings add needs its own host permission, asked for on the options
// page, and gets the same title watcher registered at runtime. A site
// without its permission on this Chromebook (settings sync, grants don't) is
// left out until it has one.

import { WATCHED } from "./unread.js";

export const WATCHER_ID = "tico-watch-extra";

// The match pattern for an origin: "https://example.com" -> "https://example.com/*".
export const pattern = (origin) => `${origin}/*`;

// The patterns to register: each setting's site not already built in.
export function extraPatterns(sites) {
  return [...new Set(sites.map(pattern))].filter((p) => !WATCHED.includes(p));
}

// Make the registered watcher match the granted extra sites. `api` is
// chrome. Returns the patterns now watched.
export async function syncWatchers(api, sites) {
  const granted = [];
  for (const p of extraPatterns(sites)) if (await api.permissions.contains({ origins: [p] })) granted.push(p);
  const [current] = await api.scripting.getRegisteredContentScripts({ ids: [WATCHER_ID] });
  const same = current && current.matches.length === granted.length && current.matches.every((m) => granted.includes(m));
  if (same || (!current && granted.length === 0)) return granted;
  if (current) await api.scripting.unregisterContentScripts({ ids: [WATCHER_ID] });
  if (granted.length > 0) {
    await api.scripting.registerContentScripts([
      { id: WATCHER_ID, matches: granted, js: ["src/unread_watch.js"], runAt: "document_idle", persistAcrossSessions: true },
    ]);
  }
  // A registered script runs on pages loaded from now on, so pages already
  // open on a newly watched site get the watcher now; it starts only once
  // per page, however often it's injected.
  const added = granted.filter((p) => !current?.matches.includes(p));
  if (added.length > 0) {
    for (const tab of await api.tabs.query({ url: added })) {
      try {
        await api.scripting.executeScript({ target: { tabId: tab.id }, files: ["src/unread_watch.js"] });
      } catch (e) {
        // a discarded or closing tab gets the watcher when it next loads
        console.warn(`tico: couldn't watch tab ${tab.id} yet:`, e?.message ?? e);
      }
    }
  }
  return granted;
}

// Whether a page at `url` is watched: one of the built-in sites, or one the
// settings name now. A page whose site was removed keeps its injected
// watcher until it reloads (unregistering doesn't remove it), so its
// reports are dropped here.
export function isWatched(url, sites) {
  let origin;
  try {
    origin = new URL(url).origin;
  } catch {
    // a report with no page address isn't from a watched page
    return false;
  }
  return WATCHED.includes(pattern(origin)) || sites.includes(origin);
}

// `fn` run one call at a time, in the order called, so an older call
// can't finish after a newer one and undo it. A failure doesn't stop the
// calls after it.
export function serialized(fn) {
  let last = Promise.resolve();
  return (...args) => {
    const run = last.then(() => fn(...args));
    last = run.catch(() => {});
    return run;
  };
}
