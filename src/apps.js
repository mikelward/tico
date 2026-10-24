// The app keys (SPEC.md §9.1): each opens a new window of its app. A window
// or tab belongs to an app by its origin, which the launcher's tab search
// uses to find a tab by its app's name (§9.4).

// The manifest's app keys, which settings can give any web app.
export const APP_COMMANDS = ["app-calendar", "app-chat", "app-meet", "app-music"];

export const DEFAULT_APPS = [
  { command: "app-calendar", name: "Google Calendar", url: "https://calendar.google.com/" },
  { command: "app-chat", name: "Google Chat", url: "https://chat.google.com/" },
  { command: "app-meet", name: "Google Meet", url: "https://meet.google.com/" },
  { command: "app-music", name: "YouTube Music", url: "https://music.youtube.com/" },
];

function origin(url) {
  try {
    return new URL(url).origin;
  } catch {
    // chrome:// pages and blank tabs have no origin worth matching
    return null;
  }
}

// The app a URL belongs to, by its origin, or null.
export function appOfUrl(url, apps = DEFAULT_APPS) {
  const o = url && origin(url);
  if (!o) return null;
  return apps.find((a) => a.url && origin(a.url) === o) ?? null;
}

// The app a window belongs to, by its first tab's origin, or null.
export function appOf(win, apps = DEFAULT_APPS) {
  return appOfUrl(win.tabs?.[0]?.url ?? win.tabs?.[0]?.pendingUrl, apps);
}
