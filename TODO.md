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
- **The four suggested keys are `Search+J`, `Search+K`, `Search+Space` and
  `Search+Tab`**, as SPEC.md §7.1 picks, each with an `Alt+Shift+` default
  so the manifest installs off ChromeOS too. Attention's default is
  `Alt+Shift+U`, not `Alt+Shift+Tab`, which Windows and most Linux desktops
  take for window switching. `Search+.` (next layout) lost its suggestion
  to make room. Reversible: edit `manifest.json`.
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
- **The app list is built in** (Calendar, Chat, Meet, YouTube Music), until
  the options page can edit it. Reversible: `src/apps.js`.

## Later

- Frame offsets (SPEC.md §5.3): tiles use the bounds as given; measuring
  and correcting each window type's frame waits for a device.
- Window IDs change across a browser restart (SPEC.md §14.2): windows come
  back on the current workspace; matching them by tab URL is still to do.
- Profile keys (SPEC.md §9.2), the clocks popover's strips and DST note
  (§8.2), the dim (§10.1) and the options page (§13).
- A Playwright smoke test in CI (SPEC.md §17): loading the extension in
  Chromium and opening its pages worked by hand on 2026-10-24, but would
  add the first dependency.
