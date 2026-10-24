# TODO

## Decisions needing review

Guesses made on autopilot (2026-10-24), each cheap to undo.

- **No `AGENTS.md` in tico yet.** The sibling repos each have one; tico
  follows their shared conventions (tide's especially) without its own copy.
  The alternative is a short one pointing at `SPEC.md` and those
  conventions. Reversible: add the file.
- **Plain Node, no dependencies or build step.** Tests use `node --test`
  on Node 22 (CI pins major 22), ES modules throughout, so the extension
  loads the same files it tests. The alternative is TypeScript or a
  bundler. Reversible: nothing yet depends on the toolchain.
- **The four suggested keys are `Search+J`, `Search+K`, `Search+Space` (the
  dashboard) and `Search+Tab`**, each with an `Alt+Shift+` default so the
  manifest installs off ChromeOS too. Attention's default is `Alt+Shift+U`,
  not `Alt+Shift+Tab`, which Windows and most Linux desktops take for window
  switching. `Search+.` (next layout) lost its suggestion to make room.
  Swap-with-master moved off `Search+Space` to `Search+Shift+M`, bound by
  hand; `Search+Z` was the first idea, but it's ChromeOS's layout menu.
  Reversible: edit `manifest.json`.
- **A maximized or fullscreen window on a workspace you leave is minimized
  like the rest, and comes back normal**, losing its maximize. The
  alternative is remembering the state and restoring it. Reversible: a
  per-window field.
- **An app key with no window opens the site in a `popup` window**, which
  tico then tiles and finds as the app's. It never tries
  `chrome.management.launchApp`, which SPEC.md §9.1 leaves unverified for
  web apps. An installed web app's own window is still found and focused.
  The alternative is launching the installed app. Reversible: one function.
- **A page's first title report sets its baseline and marks nothing**, so
  opening, reloading or switching accounts in Gmail with old unread mail
  doesn't mark it; only a rise tico sees marks. The alternative marks any
  nonzero first count.
  Reversible: one line in `Tico.title`.
- **The watched origins are built in** (Gmail, Chat, Calendar), in the
  manifest's `content_scripts`, until the options page can request others
  as optional host permissions. Reversible: `src/unread.js` and the
  manifest.
- **Granting all-sites access turns the dim on**, and the toggle lives on
  the dashboard and home page until the options page exists. The prompt
  takes focus, which closes the dashboard that asked, so tico treats the
  grant itself as the switch. Turning it off
  undims every page, then gives the access back. Revoking the access at
  `chrome://extensions` instead leaves pages dimmed until they reload, since
  tico can no longer reach them. The alternative is a separate stored
  setting. Reversible: `Tico.dimOn` and the page's checkbox.
- **The clock detail opens on a click** of the dashboard's clocks, and is
  always open on the home page, where there's room. Day is 07–19 and work is
  09–17 in every zone, and the DST note looks three weeks ahead. Zone
  abbreviations come from a small built-in table of common zones, since
  Chrome names London "GMT+1"; others show Chrome's form. The alternatives
  are an always-open detail and settings for the hours. Reversible:
  `src/launcherview.js` and `src/clocks.js`.
- **The launcher's ranking**: a home-grown fuzzy match (letters in order,
  word starts and runs score higher), ties broken by `tab.lastAccessed`, and
  a query with no match in its scope searching both. Tabs only, not windows
  as such, since every window's tabs are listed. The alternative is a
  library such as fzf's algorithm. Reversible: `src/launcher.js`.
- **The dashboard opens full screen every time**, not as Chrome's toolbar
  popup. If ChromeOS shows its full-screen bubble on each open, a large
  centered window is the fallback. Reversible: `Tico.dashboard`.
- **Always-on-top windows aren't tracked at all**: Document
  picture-in-picture and always-on-top popups stay put on every workspace,
  since ChromeOS refuses to minimize them. The alternative is tracking them
  as floating windows that stay on one workspace, which can't hide them.
  Reversible: `managed()` in `src/tico.js`.
- **Secure Shell's popup windows tile**, by its extension ID in a built-in
  list, until the options page has tile and float rules (SPEC.md §5.4).
  Reversible: `TILED_POPUP_ORIGINS`.
- **The app list is built in** (Calendar, Chat, Meet, YouTube Music), until
  the options page can edit it. Reversible: `src/apps.js`.

## Later

- Frame offsets (SPEC.md §5.3): tiles use the bounds as given; measuring
  and correcting each window type's frame waits for a device.
- Window IDs change across a browser restart (SPEC.md §14.2): windows come
  back on the current workspace; matching them by tab URL is still to do.
- Profile keys (SPEC.md §9.2) and the options page (§13), which takes the
  clock zones and hours.
- A month calendar with ISO week numbers under the clocks, as tide's
  popover has.
- A Playwright smoke test in CI (SPEC.md §17): loading the extension in
  Chromium and opening its pages worked by hand on 2026-10-24, but would
  add the first dependency.
