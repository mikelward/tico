// The app keys (SPEC.md §9.1): each focuses its app's window, bringing its
// workspace, or opens it. Web apps match by the origin of the window's tab.

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

// The app a window belongs to, by its first tab's origin, or null.
export function appOf(win, apps = DEFAULT_APPS) {
  const url = win.tabs?.[0]?.url ?? win.tabs?.[0]?.pendingUrl;
  const o = url && origin(url);
  if (!o) return null;
  return apps.find((a) => origin(a.url) === o) ?? null;
}
