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
  `Search+.`**, each with `Alt+Shift+` as the non-ChromeOS default so the
  manifest installs everywhere. SPEC.md §7.1 reserves one for `Search+Tab`
  (attention); that swaps in when attention lands. Reversible: edit
  `manifest.json`.
- **A maximized or fullscreen window on a workspace you leave is minimized
  like the rest, and comes back normal**, losing its maximize. The
  alternative is remembering the state and restoring it. Reversible: a
  per-window field.
- **An app key with no window opens the site in a `popup` window**, which
  tico then tiles and finds as the app's. It never tries
  `chrome.management.launchApp`, which SPEC.md §9.1 leaves unverified for
  web apps. An installed web app's own window is still found and focused.
  The alternative is launching the installed app. Reversible: one function.
- **The app list is built in** (Calendar, Chat, Meet, YouTube Music), until
  the options page can edit it. Reversible: `src/apps.js`.

## Later

- Frame offsets (SPEC.md §5.3): tiles use the bounds as given; measuring
  and correcting each window type's frame waits for a device.
- Window IDs change across a browser restart (SPEC.md §14.2): windows come
  back on the current workspace; matching them by tab URL is still to do.
- Profile keys (SPEC.md §9.2), the
  popup and clocks (§8), attention (§10.3), the dim (§10.1) and the
  options page (§13).
