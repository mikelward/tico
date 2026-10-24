# Testing and publishing tico

How to try a change on a Chromebook, then publish it on the Chrome Web
Store. The store steps are from memory of how the store worked through
2026. Where the dashboard says otherwise, it's right and this file is out of
date; fix the file.

## 1. Test before a Chromebook

From a checkout, on any Linux or macOS machine with Node 22:

```sh
make lint    # every script parses
make test    # the node tests, with a fake chrome.* (SPEC.md §17)
npm ci       # once, for the smoke test
npx playwright install chromium   # once
make smoke   # loads the extension in Chromium and opens its pages
```

CI runs the same three on every pull request. The smoke test can't show
tiling, workspaces or keys: desktop Chromium has no ChromeOS window
manager. Those need a Chromebook.

## 2. Load it on a Chromebook

Chrome loads an extension from a folder, as it is. There's no build step.

1. Get the files onto the Chromebook, in a folder the Files app can see:
   - **From GitHub:** open the repository, then **Code › Download ZIP**,
     and unzip it in the Files app. This gives you `main`. For a branch,
     switch to it on GitHub first.
   - **From Linux (Crostini):** `git clone` it into your Linux home, which
     the Files app shows as **Linux files**.
2. Open `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose the folder that holds
   `manifest.json`.
4. Bind the keys at `chrome://extensions/shortcuts`. Chrome binds four
   when it installs tico; the options page's **Keys** list says which of
   the rest are still to do.
5. Open tico's options (right-click its toolbar icon › **Options**) and
   work through the **Setup checklist**.

To try a change: update the folder (unzip again, or `git pull`), then click
the reload arrow on tico's card in `chrome://extensions`. Reloading resets
tico's worker, not your settings.

To see errors: on tico's card, **Errors** lists what the worker threw, and
**Inspect views › service worker** opens its console. A page's own console
is the usual DevTools (Ctrl+Shift+J) on that page.

What to check by hand, since no test can: tiling on each display,
workspace keys, sending a window, the home page on an empty workspace,
Search+Space, the dim, and that Android and Linux windows are left alone.

## 3. Before the first upload

These are one-time gaps tico has today:

- **Icons.** The store needs a 128×128 PNG icon in the package, named in
  `manifest.json`'s `icons`, plus 16 and 48 for the toolbar and
  `chrome://extensions`. tico has none yet.
- **A privacy policy URL.** The store asks for one when an extension
  handles user data, and reading tab titles and URLs counts. tico has no
  server and collects nothing for its developer. It keeps its state in
  `chrome.storage.local`, on the Chromebook. But its shared settings (the
  clocks, the app keys' sites, the watched sites, the workspace settings) are in
  `chrome.storage.sync`, which Chrome copies to your Google account and
  your other signed-in browsers when Chrome Sync is on. The policy should
  say both. A short page on GitHub Pages or in this repository is enough.
- **Screenshots.** At least one, 1280×800 or 640×400. Take them on the
  Chromebook (Search+Ctrl+Show windows takes a screenshot).
- **A developer account.** Register at the
  [Chrome Web Store developer dashboard](https://chrome.google.com/webstore/devconsole)
  with your Google account. It takes a one-time registration fee, $5 when
  last checked, and the account needs 2-Step Verification.

## 4. Package it

The store takes a ZIP with `manifest.json` at its top level. Leave out the
tests and anything only development needs:

```sh
version=$(node -p "require('./manifest.json').version")
rm -f "tico-$version.zip"
zip -r "tico-$version.zip" manifest.json src \
    -x 'src/*_test.js' -x 'src/fake_chrome.js'
unzip -l "tico-$version.zip"   # check what went in
```

Before zipping an update, raise `version` in `manifest.json`. The store
refuses an upload whose version isn't higher than the published one.
Version changes go through a pull request like any other change, so the
ZIP is always built from `main`.

## 5. Upload and submit

In the [developer dashboard](https://chrome.google.com/webstore/devconsole):

1. **New item** (or, for an update, the item's **Package** tab ›
   **Upload new package**), and choose the ZIP.
2. **Store listing:** the description (README.md's first paragraph is a
   start), category (Productivity, or Tools), language, the icon and the
   screenshots.
3. **Privacy:**
   - **Single purpose:** "Tiles and arranges Chrome and web app windows on
     ChromeOS into workspaces, as a tiling window manager does."
   - **Permission justifications**, one each:
     - `storage`: settings, and the workspace state that survives a
       restart.
     - `system.display`: each display's work area, to lay out windows.
     - `tabs`: tab titles and URLs, for the launcher's tab search, for
       matching windows after a restart, and for unread counts.
     - `scripting`: the title watcher on sites you add, and the dim.
     - Host access to Gmail, Chat and Calendar: their unread counts, from
       the page title.
     - Optional all-sites access: the dim, asked for only when you turn it
       on.
   - **Remote code:** no. tico runs only the code in its package.
   - **Data use:** tico sends nothing to its developer or anyone else.
     Chrome Sync carrying the shared settings is Chrome's, not tico's, but
     say so in the policy, as above. Then tick the certifications.
4. **Distribution:** **Unlisted** to try a published build first (only
   people with the link can install it), or **Public**. **Private** limits
   it to listed testers.
5. **Submit for review.** Reviews have taken from a day to a few weeks.
   Broad host permissions slow them down. tico asks for all-sites access
   only as an optional permission, which helps.

Once it's published, a Chromebook installs it from the store like any
extension, and updates arrive on their own within a few hours of approval.
Remove the unpacked copy from `chrome://extensions` first, or you'll have
two ticos fighting over the same windows.
