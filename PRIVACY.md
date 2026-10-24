# tico privacy policy

Effective 24 October 2026.

tico is a Chrome extension that tiles and arranges your Chrome and web app
windows on ChromeOS. This policy says what it reads, what it keeps, and
where that goes.

**In short:** tico has no server, no analytics and no ads. It sends nothing
to its developer or to anyone else. What it keeps stays in Chrome's own
extension storage, on your Chromebook. The one exception is your settings,
which Chrome Sync copies to your Google account if you have Sync turned on.

## What tico reads

- **Your windows and tabs**, through Chrome's `tabs` and `windows` APIs:
  - each window's position, size and state;
  - each tab's title, address and site icon.

  tico uses them to tile your windows, put them on workspaces, find tabs
  in its launcher, and put windows back where they were after Chrome
  restarts.
- **Your displays' sizes**, to lay out windows on each one.
- **Page titles on sites it watches for unread counts**, which are Gmail,
  Google Chat and Google Calendar, plus any sites you add in its options.
  On those sites a small script reports the page title whenever it changes.
  tico reads only the unread count in the title, such as the 3 in
  "Inbox (3)", to mark a window that needs your attention. It doesn't read
  the page's content.
- **Nothing else from the pages you visit.** If you turn on the optional
  dim, tico asks for access to all sites. It uses that access only to place
  a translucent overlay over windows you're not using, and it reads nothing
  from those pages.

## What tico keeps, and where

- **On your Chromebook**, in `chrome.storage.local`:
  - which windows are on which workspace, and their layouts;
  - the addresses of up to 20 tabs per window, so windows can return to
    their workspaces after a restart;
  - the latest unread count for each watched tab;
  - this Chromebook's layout settings and the setup checklist's ticks.

  This data never leaves the Chromebook. Removing tico deletes it.
- **In your Chrome settings**, in `chrome.storage.sync`:
  - your clocks and working hours;
  - the names and addresses of the sites on tico's app keys;
  - the sites you added for unread counts;
  - your workspace layout settings and the dim's strength.

  If Chrome Sync is on, Chrome copies these to your Google account and your
  other signed-in browsers, as it does for any extension's synced settings.
  That is Chrome's service, covered by
  [Google's privacy policy](https://policies.google.com/privacy). tico has
  no access to your account beyond these settings. Removing tico, or
  resetting its settings on its options page, deletes them.

## What tico sends

Nothing. tico makes no network requests of its own. Showing a tab's site
icon in the launcher loads that icon the way Chrome's own tab strip does.

## Permissions

| Permission | Why |
| --- | --- |
| `tabs` | Tab titles and addresses, for the launcher, restarts and unread counts |
| `system.display` | Each display's size, to lay out windows |
| `storage` | Keeping the state and settings above |
| `scripting` | The unread-count script on sites you add, and the dim's overlay |
| Gmail, Chat and Calendar | Their unread counts, from the page title |
| All sites (optional) | Only if you turn on the dim, to dim inactive windows |

## Changes and contact

Changes to this policy are made in this file, and its history is public in
[tico's repository](https://github.com/mikelward/tico/commits/main/PRIVACY.md).
Questions go to [tico's issues](https://github.com/mikelward/tico/issues).
