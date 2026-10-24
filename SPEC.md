---
last_modified: 2026-10-24
---

# tico: design spec (milestone 1)

tico is tiling on ChromeOS, as close to [tide](https://github.com/mikelward/tide)
and the KDE setup in `mikelward/scripts` (`setup-kde`) as a Chromebook allows
without turning off verified boot. It is a **Manifest V3 extension** that tiles
Chrome and installed web app windows, owns its own workspaces, and dims the
windows you're not in. A **checklist** sets the native ChromeOS shortcuts and
settings to the tide key map where the OS can do the job better than an
extension can.

This document is milestone 1: what ChromeOS allows, the decisions that
follow, and what "done" means for each later milestone. Claims about ChromeOS
and Chromium were checked on 2026-10-23 against Chromium `main` at
`a3f88457` (`chrome/VERSION` major 158) and chrometile at `af8e367`, except
where a claim says *(unverified)* or *(secondary)*: those came from release
notes or news reports, and are what M2 checks on a real device first.

Contents:
[Goals](#1-goals) ·
[What ChromeOS allows](#2-what-chromeos-allows) ·
[Decisions](#3-decisions) ·
[Feature map](#4-feature-map) ·
[Windows](#5-windows-and-layouts) ·
[Workspaces](#6-workspaces) ·
[Keys](#7-keys) ·
[Status and clocks](#8-status-bar-and-clocks) ·
[Launching](#9-launcher-and-app-keys) ·
[Focus](#10-focus-cue-focus-and-attention) ·
[The rest of the desktop](#11-the-rest-of-the-desktop) ·
[Linux apps](#12-linux-apps-crostini) ·
[Settings](#13-settings) ·
[The extension](#14-the-extension) ·
[Repos](#15-where-things-live) ·
[Milestones](#16-milestones) ·
[Testing](#17-testing) ·
[Open questions](#18-open-questions) ·
[Patches](#19-upstream-patches-and-workarounds) ·
[Googlebook OS](#20-googlebook-os-tidal) ·
[The rest of the setup](#appendix-a-the-rest-of-the-setup)

---

## 1. Goals

**Must have**, each taken from tide's §1 or `setup-kde`:

- dwm/Krohnkite tiling, never BSP: **tile** (master + stack), **three
  columns**, **two columns + stack**, **monocle**. Layout per workspace.
- A lone window centered at **80%** width on an ultrawide, **100%** on 16:9
  or 16:10.
- Nine **workspaces** on `Search+1…9`, sending a window on
  `Search+Shift+1…9`, stepping on `Search+Left/Right`.
- The tide **key map**, with Search as Super, for every action ChromeOS lets
  tico or the OS bind.
- **Inactive windows dimmed** as the focus cue.
- **App keys**: `Search+G` browser, `Search+T` terminal, `Search+C` Calendar,
  `Search+M` Meet, `Search+Y` YouTube Music, and the rest of tide's letters.
- **Clocks** for SF, NYC and LON beside local time.
- Dialogs and popups **float**; nothing steals focus.

**Non-goals**

- Replacing the ChromeOS shell, shelf, lock screen or login. The OS owns them,
  and no third-party API reaches them (§2).
- Tiling Android or Linux windows from the extension. ChromeOS doesn't expose
  them (§2.1). Linux apps get their own path (§12).
- Developer mode, custom firmware or a Chromium OS build. Those are the
  [off-ramp](#36-the-off-ramp-run-tide), not tico.

**Principles**, carried over from tide:

1. **One owner per job.** Where ChromeOS already does a job (lock, launcher,
   notifications, screenshots, theme), tico configures it and stays out.
   tico owns only what the OS lacks: tiling, workspaces, the dim and clocks.
2. **Every requirement names its mechanism** (§4), and each is checked on a
   device before it's relied on.
3. **State survives the service worker.** MV3 kills an idle worker, so
   nothing tico knows lives only in memory (§14.2).

## 2. What ChromeOS allows

### 2.1 Extensions see Chrome windows, nothing else

- `chrome.windows` lists **Browser-backed windows only**: tabbed windows,
  popups, devtools and **installed web apps**, which report `type: "app"`
  (`chrome/browser/extensions/browser_extension_window_controller.cc`,
  `api/tabs/windows_util.cc`).
- **Android, Linux, Borealis and system windows are never listed.** When one
  of them has focus, `windows.onFocusChanged` reports `WINDOW_ID_NONE`.
- `windows.update` sets `left`, `top`, `width`, `height`, `focused`, `state`
  and `drawAttention`. Bounds can't be combined with minimized, maximized or
  fullscreen. Google's own
  [virtualdesktops-extension](https://github.com/google/virtualdesktops-extension)
  warns that the bounds you get aren't exactly the ones you asked for.
- Picture-in-picture windows report `type: "normal"` (a TODO in the source,
  crbug 438514981), so tico has to recognize them another way (§5.4).
- `chrome.system.display.getInfo` gives each display's `bounds` and
  `workArea`, which excludes the shelf. Changing the display layout is
  Kiosk-only (`extensions/common/api/system_display.webidl`).
- Lacros ended in 2024 *(secondary:
  [9to5Google](https://9to5google.com/2024/07/12/chromeos-lacros-ending/))*,
  so the one Ash-integrated Chrome is the only browser to target.

### 2.2 Keys work only while a Chrome window has focus

- An extension may ship **at most 4** commands with suggested keys
  (`kMaxCommandsWithKeybindingPerExtension = 4`,
  `extensions/common/api/commands/commands_handler.cc`). It may declare
  any number more, which **you bind by hand** at
  `chrome://extensions/shortcuts`. No API sets them.
- **Global commands don't exist on ChromeOS.**
  `GetGlobalAcceleratorListener()` returns `nullptr` there, with the comment
  "Global extension commands are not supported on ChromeOS"
  (`chrome/browser/extensions/extension_commands_global_registry.cc`).
- So every tico key fires only while a Chrome or web app window is focused.
  It never fires over an Android app, a Linux app, the launcher or an empty
  desk. tico designs around that (§6.2).
- OS shortcuts win over extension ones. Search is a valid modifier for
  extension commands on ChromeOS only.
- **Only some keys can be bound**: A–Z, 0–9, Comma, Period, the arrows,
  Insert, Delete, Home, End, Page Up, Page Down, Space, Tab and the media
  keys (`ui/base/accelerators/command.cc`, `ParseImpl`). Return, Backspace,
  `\`, `/`, `=`, `-` and `` ` `` are rejected, so five tide keys need new
  combos (§7.1). The shortcuts page enforces the same set
  *(unverified)*.
- An IME extension (`chrome.input.ime`) is not a way round this. It sees
  keys only while it is the active input method **and** a text field has
  focus (`ui/base/ime/ash/input_method_ash.cc`).

### 2.3 The powerful APIs are allowlisted

| API | Would give | Status |
|---|---|---|
| `wmDesksPrivate` | list, switch and move windows between desks | allowlisted to 6 IDs |
| `automation` | the whole desktop's window tree | allowlisted to 4 IDs, "first-party … very trusted" |
| `accessibilityPrivate` | global key interception | allowlisted to 2 IDs |
| `autotestPrivate` | everything | allowlisted to 3 IDs |
| `wallpaper` | set the wallpaper | component only on `main` |
| `enterprise.*` | device info | policy-installed only; nothing for windows |

Paths: `chrome/common/extensions/api/_permission_features.json`,
`extensions/common/api/_manifest_features.json`,
`chromeos/ash/experiences/extensions/common/api/_permission_features.json`.
The allowlists are hashed IDs, so developer mode doesn't open them either.

**Isolated Web Apps** get Window Management, borderless display and Controlled
Frame, but only for **their own** windows; nothing in the web platform moves
another app's window. A consumer can install an unlisted IWA only behind
`kIsolatedWebAppDevMode`, which is off by default
(`chrome/common/chrome_features.cc`).

### 2.4 What ChromeOS does natively

From `ash/public/cpp/accelerators.h` and
`ash/webui/shortcut_customization_ui/backend/accelerator_layout_table.cc`.
"Search" is the launcher key.

| Action | Default |
|---|---|
| Launcher | tap Search |
| Lock | Search+L |
| Snap left / right, cycling the ratio | Alt+[ / Alt+] |
| Maximize / minimize | Alt+= / Alt+- |
| Float | Search+Alt+F |
| Window layout menu (partial split, ⅓ ⅔) | Search+Z |
| Snap Group toggle | Search+Shift+G |
| Move window to the other display | Search+Alt+M |
| Desk left / right | Search+[ / Search+] |
| Move window to the desk left / right | Search+Shift+[ / ] |
| Desk 1–8 | Search+Shift+1…8, in the "improved desks shortcuts" set only |
| Cycle windows | Alt+Tab |
| Launch shelf item 1–8 | Alt+1…8 *(unverified on current builds)* |

- **The Shortcuts app** (ChromeOS 123, *secondary*) adds up to 5 combos to an
  **existing** action. It can't create actions. 88 actions are editable and
  101 locked. Maximize, minimize, fullscreen, float, snap, the layout menu,
  move to display and the desk-left/right actions are editable; desk-by-number
  and Alt+Tab are not.
- **Desks**: 8 by default, 16 behind device feature management
  (`kDesksUpperLimit`). There is **no "move window to desk N"** shortcut; a
  TODO in the source says so.
- **Unlaunched tiling**: `kTilingWindowResize` resizes a window toward an edge
  in ½ → ⅓ → ¼ steps on Search+Ctrl+, . ; /, and `kWindowSplitting` splits by
  dragging one window onto another. Both are off by default; whether
  `chrome://flags` lists them is *(unverified)*.

### 2.5 chrometile shows the ceiling

[chrometile](https://github.com/brockgr/chrometile) (MV3, v0.13, last commit
2026-10-13) is the best existing extension, and it hits every limit above:

- **Layouts**: Tall, Wide, Columns and Ultrawide (a centered main column).
  Split in 5% steps, a main-window count and a margin, all per display.
- **Permissions**: `storage`, `system.display`, `tabs` (for a URL deny list).
- **Keys**: 20 commands, only 2 with suggested keys, none global.
- **No workspaces, no dim, no clocks.**
- **Code issues, found by reading it**:
  - Window order and the float list live only in memory, so they're lost when
    the service worker sleeps.
  - Listeners are registered after two promises. An event that wakes the
    worker can be missed, so the first key after idle may do nothing
    *(inferred, not tested)*.
  - `moveToDisplay` calls `unshift` on the wrong `this`.
  - Every window on every desk tiles into one grid, since it can't see desks.

The other attempts are older and dead:
[Quilt](https://github.com/MrViolets/Quilt) (MV3, 2023),
[chromewm](https://github.com/JayGoldberg/chromewm) (MV2, 2018, with
workspaces), croutonwm and chrome-o-tile. MV2 no longer runs on ChromeOS 133
and later.

## 3. Decisions

### 3.1 A new extension, with chrometile until it's ready

chrometile proves the mechanism, but it isn't a base to build on:

- **Most of tico is what chrometile lacks**: workspaces, saved state, the
  dim, clocks, attention and app keys. The workspace state machine (§6.1)
  is a different core from chrometile's one window list per display.
  chrometile is about 600 lines, 496 of them in `src/background.js`, so a
  fork would keep the idea and little of the code.
- **Its foundations would be rewritten anyway**: state only in memory, late
  listener registration, and no notion of desks (§2.5).
- **tico's logic must be testable on its own** (§17) and portable to tidal
  (§20.4). chrometile mixes layout logic with `chrome.*` calls.
- **The license doesn't decide it.** chrometile is Apache-2.0, like tico,
  so borrowing a piece only needs credit, which tico's README gives.

**Meanwhile, use chrometile.** It works today and is maintained: its last
commit is 2026-10-13, and it merges outside contributions. It gives the
Chromebook basic tiling until tico reaches M3, when tico replaces it. They
can't run together, since both would move the same windows.

**Send chrometile two fixes**, each a small PR. They help its users now and
cost tico little:

1. **`moveToDisplay`** (`src/background.js` 411–425) calls
   `this.window_ids.unshift` from a plain function, where `this` is the
   global object, not a display. `window_ids` lives on each display's
   object, so the call throws inside the `windows.update` callback. The
   window moves, but it isn't put first in the destination's list, the
   retile never runs, and the promise never settles. The fix is
   `allDisplays[index].window_ids.unshift(...)`, then the retile.
2. **Late listener registration.** Its listeners are added inside
   `isChromebook().then(getSettings().then(...))`. MV3 delivers the event
   that wakes a sleeping worker only to listeners registered synchronously
   at the top level, so the first key or window event after idle can be
   lost *(inferred from the code, not tested)*. The fix registers every
   listener at the top level, and has each one wait for the settings
   before acting.

Both are from reading chrometile at `af8e367`. Each PR should reproduce the
problem first: a unit test for `moveToDisplay`, and for the listeners,
letting the worker go idle and then pressing a key.

Contributing the rest of tico to chrometile instead would change its whole
design, likely more than its maintainer wants. Asking costs nothing, but
tico doesn't wait on the answer.

### 3.2 tico owns the workspaces; native desks stay at one

Extensions can't see desks (§2.3), so a tiler running across desks tiles the
windows of every desk together. That's chrometile's bug. tico therefore keeps
its own nine workspaces and **switches by minimizing** the windows of the
workspace you leave and restoring those of the one you enter (§6). This is
how chromewm did it.

- **For**: the layout, order, master count and focus are exact per
  workspace, persist across restarts, and every tide workspace key works.
- **Against**: the switch shows the minimize animation. Android and Linux
  windows can't be minimized by tico, so they stay visible on every workspace.
  Overview (and Alt+Tab, *unverified*) list minimized windows from other
  workspaces too.
- **The alternative**, native desks, has real animations and keys that work
  over every app. But tico would lose track of which window is where after
  any native desk switch, and there's no key to send a window to desk N.
  It's [open question 1](#18-open-questions).

### 3.3 Search is Super

The tide key map moves to Search, the key in Super's place on a Chromebook
and the one tide taps for the launcher. Where the OS takes a Search combo,
the native action is usually the same one tide binds (Search+L locks,
tapping Search opens the launcher). The rest of the conflicts are in §7.2.
**Alt+Shift** is the fallback modifier for anything Search can't carry,
which is chrometile's choice too.

### 3.4 Native features, configured from a checklist

The lock, launcher, notifications, screenshots, screen-share picker, dark
mode, keyboard layout and idle policy are ChromeOS's, and no extension can
replace them. tico's options page has a **setup checklist**: every Settings
and Shortcuts-app change that brings the OS closer to tide, each one with
the page to open and how to check it's done. ChromeOS settings can't be
scripted, so the list is the mechanism, and tico checks what it can
(command bindings, through `chrome.commands.getAll`).

### 3.5 Web apps are installed PWAs, one per site

tide runs Gmail, Calendar, Chat, Meet and YouTube Music as Chrome `--app=URL`
windows. ChromeOS has no command line, so they become **installed web
apps**. Those are listed (`type: "app"`), tileable, and launchable from a
key. Each is one site per window, which tide's attention rules
already assume (§10.3).

### 3.6 The off-ramp: run tide

Everything tico can't reach (Android and Linux windows, global keys, the
bar, focus follows mouse) needs the OS replaced. On a Chromebook that means
third-party UEFI firmware (MrChromebox) and a normal distro running tide,
giving up verified boot, ChromeOS updates and Google's security guarantees,
with some risk of bricking *(unverified for any specific model)*.
[crouton](https://github.com/dnschneid/crouton) is end of life (2024-12-31)
and broken from ChromeOS 111. tico doesn't pursue either, but the spec
records the line so nobody rediscovers it.

## 4. Feature map

Status: **yes** = tico or ChromeOS meets the tide or KDE behavior;
**partial** = close, with the gap named; **no** = not reachable without the
off-ramp.

| tide / KDE | On ChromeOS | Status |
|---|---|---|
| Tile, three-column, two columns + stack, monocle (tide §6.1) | tico layouts over Chrome and web app windows (§5) | **partial**: not Android or Linux windows |
| Lone window 80% on ultrawide, 100% otherwise | tico, per display, from `workArea` aspect | **yes** |
| Layout per workspace | tico state per workspace (§6) | **yes** |
| 9 workspaces, Search+1…9 / Shift (KDE, tide §6.6) | tico workspaces by minimize (§3.2) | **partial**: keys need a Chrome window focused; Android/Linux windows on every workspace |
| One workspace per monitor from a shared pool (tide §6.5) | tico: nine shared workspaces, one showing per display (§6.1) | **partial**, same caveats |
| Dim inactive, 0.07 (tide §6.2; KDE 0.15) | an overlay injected into the page of each unfocused window (§10.1) | **partial**: page only, not tab strip or title bar; not over `chrome://` pages |
| No borders, no gaps | ChromeOS draws its own frames; tico margin 0 | **partial** |
| Maximize, fullscreen, restore (tide §6.3) | native Alt+=, fullscreen key, rebound to Search+Up/Shift+Up/Down in the Shortcuts app | **yes** |
| Dialogs float, centered on parent (tide §6.4) | popups and dialogs untiled by type and rule (§5.4) | **yes** for Chrome; the OS places native dialogs |
| Focus follows mouse (KDE `FocusFollowsMouse`) | none | **no** |
| Nothing steals focus (tide §14) | ChromeOS activation rules; tico never focuses unasked | **partial**: the OS decides for apps |
| Super+Tab to the window wanting attention (tide §14.3) | tico's attention list from title-count watchers (§10.3) | **partial**: chosen sites only |
| Full-width bar, workspaces, urgency (tide §7) | no top bar; shelf + tico toolbar badge + popup (§8) | **partial** |
| Tray, network, volume, Bluetooth, battery | ChromeOS status area on the shelf | **yes**, native |
| SF / NYC / LON clocks beside local (tide §7.3) | tico popup: zones, strips, DST, scrubbing (§8.2) | **partial**: one click away, not always on screen |
| Launcher on a Super tap (tide §8) | ChromeOS launcher on a Search tap | **yes**, native, without quick actions |
| App keys (KDE `setup-kde`, tide `hyprland.lua`) | tico commands that open or focus web apps and profiles (§9) | **partial**: from a Chrome window only; Linux apps by shelf slot |
| Two and three Chrome profiles (`browser2`, `browser3`) | a second ChromeOS account, or a Chrome profile if the build has them (§9.2) | **partial** |
| Notifications, history, DND (tide §9) | ChromeOS notification center and Do Not Disturb | **yes**, native, without auto-DND while sharing *(unverified)* |
| Idle timeline: dim 2:30, lock 5:00, off 5:30, suspend 30:00 (tide §10) | ChromeOS power settings; keep-awake toggle by `chrome.power` | **partial**: OS timings, not tide's |
| Lock = login, short hostname | ChromeOS lock screen | **partial**: no hostname |
| Screenshots of window, screen, region (tide §13) | ChromeOS screen capture | **yes**, native, saved to Downloads and copied |
| Meet sharing of a window or screen (tide §12) | Chrome's picker on ChromeOS | **partial**: no 16:9 slice of an ultrawide |
| Automatic light and dark (tide §15) | ChromeOS Auto dark mode, sunset to sunrise *(unverified)* | **partial**: sun schedule, not 07:00–19:00 |
| US Dvorak (KDE `kxkbrc`) | ChromeOS US Dvorak input | **yes** |
| Mouse: fastest speed, adaptive accel, left-handed, wheel 3× (conf `hyprland.lua`) | Settings › Mouse, per device, five steps each (§19.2) | **partial**: coarse steps; finer only through `gesture_prop` |
| Caps Lock as Compose | Caps Lock remaps to Search, Ctrl, Alt, Esc and others; no Compose | **no** |
| kitty, Ubuntu Mono, shell config | Crostini with `conf` and `setup` inside (§12) | **yes** inside Linux; its windows untiled |

## 5. Windows and layouts

### 5.1 Which windows tile

A window tiles when **all** of these hold:

- `type` is `normal` or `app`, or it's an app popup tico opened itself
  (§9.1), tracked by window ID;
- `state` is `normal`;
- it isn't on tico's float list;
- it doesn't match a float rule (§5.4).

Maximized, fullscreen and minimized windows are left alone and don't count
toward the lone-window rule, as in tide.

### 5.2 Layouts

The four tide layouts, with tide's numbers:

- **Tile** `[]=`: master on the left at `mfact` 0.55, the stack on the right.
  Default where the work area's aspect is under 2.1.
- **Three-column** `|M|`: the master centered at 50%, stacks either side;
  two windows split 50/50. Default at 2.1 and over.
- **Two columns + stack** `||=`: two masters, the stack on the right.
- **Monocle** `[M]`: every window fills the work area. Only the focused one
  is in front, so the others sit behind it rather than being minimized.

The rest is tide's §6.1:

- `mfact` moves ±0.025 per key.
- The master count is per workspace and per layout.
- New windows join the end of the stack.
- A lone window is 80% wide and centered at aspect 2.1 and over, 100%
  otherwise; both numbers are per-display settings.

Geometry is a pure function from (work area, layout, settings, window
count) to rectangles, kept free of `chrome.*` so it tests in Node (§17).
tide's Lua layout is the reference; the two share test fixtures (§15).

### 5.3 Applying it

- tico retiles on `onCreated`, `onRemoved`, `onFocusChanged`,
  `onBoundsChanged`, `system.display.onDisplayChanged` and every layout key.
  It debounces 50 ms after the last event, since one window open fires
  several.
- After `windows.update`, tico reads the bounds back and stores the
  difference per window type: the frame's offset. The next layout subtracts
  it, so tiles meet without gaps or overlaps.
- **A drag is a request.** When `onBoundsChanged` reports a move tico didn't
  make, the window takes the tile nearest its center (swapping with that
  tile's window). If the center is on another display, the window first
  moves to the workspace showing there (§6.1). A resize of a tiled window sets `mfact`. That's
  Krohnkite's behavior. A window dragged to native snap or float is left
  floating until it's tiled again with `Search+Shift+F`.
- Margin is 0, per tide. A setting allows chrometile's 2 px.

### 5.4 What floats

- `popup` windows: OAuth sign-ins, Chrome's "Save as" sheets, extension
  popups, and tico's home window (§6.2). tico's own app popups (§9.1) are
  the one exception.
- `devtools`.
- **Picture-in-picture**, which reports `normal`: a window that is
  always-on-top, which `chrome.windows` reports as `alwaysOnTop`
  *(unverified for PiP)*, or that matches chrometile's Meet PiP URL rule.
- **Chrome Remote Desktop** and the other URL rules chrometile ships, as a
  user-editable list.
- Anything you float with `Search+Shift+F`, remembered by window ID and
  persisted.

Native dialogs (file chooser, print) aren't Chrome windows. The OS places
them over their parent, which is what tide's §6.4 asks for.

## 6. Workspaces

### 6.1 Model

- Nine workspaces, numbered 1–9, shared across displays, as in tide
  (§6.5). Each display shows one at a time.
- Each workspace stores, in `chrome.storage.local` (§14.2):
  - its windows in tile order;
  - its layout, `mfact` and master count;
  - its focused window.
- Each window belongs to exactly one workspace, and carries one flag:
  **minimized by you**, set when it's minimized while its workspace is
  showing.
- A new window joins the workspace showing on the display it opens on.

**One rule decides what's on screen.** A window is shown if and only if its
workspace is showing on some display and you haven't minimized it.

- Every operation below changes only the state: which workspace each
  display shows, and which workspace each window belongs to.
- Then one **reconcile** step makes the screen match the rule. It restores
  the windows that should show, in tile order, and only then minimizes the
  ones that shouldn't, so the screen never goes empty in between. Then it
  retiles each display.
- Nothing minimizes or restores a window any other way. That's what keeps
  the cases consistent, including two displays and windows you minimized
  yourself.

| Operation | State change | Focus |
|---|---|---|
| **Show N** (`Search+N`) on display D | D shows N. If N was showing on another display, that display takes D's old workspace (a swap, as in tide). | N's stored window |
| **Send** a window to N (`Search+Shift+N`) | The window moves to the end of N's stack. If N is showing on any display, the window appears there at once; if not, it's hidden. | stays put, as in tide |
| **Activate** a window: app keys (§9.1), `Search+Tab` (§10.3) | If its workspace isn't showing, show it on the focused display, as Show N. Clear the window's minimized-by-you flag. | that window |
| **Moved to another display** by you: the native `Search+Alt+M`, or a drag ending with the window's center on another display, seen as an `onBoundsChanged` tico didn't cause | The window joins the end of the stack of the workspace showing on that display. | that window |
| **Minimize** by you | Set the flag. | ChromeOS picks |
| **Restore** by you: any un-minimize tico didn't cause, from the shelf or Alt+Tab | Clear the window's minimized-by-you flag. If its workspace is hidden, this is Activate, so the workspace comes with it. | that window |

### 6.2 Empty workspaces get a home window

Keys work only while a Chrome window has focus (§2.2), so an empty
workspace would strand you: no window, no keys. tico opens a **home
window** there instead, an extension page in a `popup` window. It shows:

- the workspace number;
- the app keys as a list, so you can still launch;
- the clocks (§8.2).

The home window takes the keys and doesn't tile. It closes when a real
window arrives, and is never counted as one.

### 6.3 Where it can't reach

- **Android and Linux windows** stay visible on every workspace and aren't
  tiled. tico's work area is still the display's, so they overlap tiles.
  Most people will keep them on the native snap keys.
- **Overview** shows every window, minimized ones included *(unverified)*.
- **Native desks**: the checklist removes all but one, so a stray
  `Search+]` has nowhere to go. A desk-aware design is open question 1.

## 7. Keys

### 7.1 The map

Bound by tico, unless the column says the Shortcuts app:

| Keys | Action | Bound by |
|---|---|---|
| tap Search | launcher | native |
| `Search+L` | lock | native |
| `Search+1…9` / `Search+Shift+1…9` | go to / send to workspace | tico |
| `Search+Left` / `Right` | previous / next workspace | tico *(Search+arrows may be Home/End; §7.2)* |
| `Search+Shift+Left` / `Right` | send to previous / next workspace | tico |
| `Search+J` / `K`, with Shift | focus / move down and up the stack | tico |
| `Search+Space` (tide: `Super+Return`) | swap with master | tico |
| `Search+Shift+.` / `Search+Shift+,` (tide: `Super+\` / `Super+/`) | grow / shrink master | tico |
| `Search+Shift+I` / `Search+Shift+D` (tide: `Super+=` / `Super+-`) | add / remove a master, dwm's letters | tico |
| `Search+.` / `Search+,` | next / previous layout | tico |
| `Search+Shift+Space` (tide: ``Super+` ``) | toggle monocle | tico |
| `Search+Up` / `Search+Shift+Up` / `Search+Down` | maximize / fullscreen / restore | Shortcuts app (Search+Up is Page Up today; §7.2) |
| `Search+Shift+F` | toggle floating | tico |
| `Ctrl+Shift+W` (tide: `Super+Backspace`) | close window | native Chrome |
| `Search+Tab` | next window wanting attention, else the last window | tico |
| `Search+Shift+N` | notification center | Shortcuts app, if the action is editable *(unverified)* |
| `Search+Alt+M` | move to other display | native |
| app letters (§9) | open or focus the app | tico |

That's about 50 tico commands. Four ship with suggested keys: `Search+Tab`,
because the shortcuts page can't capture Tab (§19.1), so a manifest
suggestion is the only way to bind it, and then the three used most,
`Search+J`, `Search+K` and `Search+Space`. If ChromeOS already owns
`Search+Tab`, the suggestion is dropped at install *(unverified)*, and
attention moves to a key the page can capture. You bind the rest once at
`chrome://extensions/shortcuts`. The checklist (§3.4)
lists every unbound command and opens that page.

The five keys the Commands API can't carry (§2.2) move to the nearest
supported combo. Shift with `.` and `,` reads as `>` and `<` for grow and
shrink. Space takes Return's swap, since tapping Search, not
`Search+Space`, opens the launcher here. Close falls back to Chrome's own
window close.

### 7.2 Conflicts to settle in M2

ChromeOS uses Search as its remapping key, and some tide combos land on
those remaps. Each must be checked on a device, and the answer goes in this
table:

| Combo | ChromeOS default | Plan |
|---|---|---|
| Search+Left / Right | Home / End | rebind in Settings › Keyboard ("Six-pack keys") if offered, else Alt+Shift+Left/Right |
| Search+Up / Down | Page Up / Down | same |
| Search+1…= | F1–F12 when "top row as function keys" is off *(unverified on current builds)* | turn the setting off; else Alt+Shift+1…9 |
| Search+Shift+G | Snap Group | unbind in the Shortcuts app, freeing it for the third profile |
| Search+Shift+D | minimize Snap Group | unbind in the Shortcuts app, freeing it for remove-a-master |
| Search+Space, Search+Shift+Space | none known *(unverified)* | keep |
| Search+Z, Search+Alt+F | layout menu, float | keep; they don't clash |

Whatever moves to Alt+Shift moves as a set, so the map stays learnable.

## 8. Status, bar and clocks

### 8.1 No top bar

tide's bar can't be drawn: the shelf goes bottom, left or right, never top,
and an extension window has a caption and can't reserve space. A
**bar window** (a short popup that tico tiles around) was considered and
rejected: it would have a title bar, take focus when clicked, and appear in
Alt+Tab and Overview.

Instead:

- **The shelf** at the bottom, as ChromeOS puts it, holds the status area:
  network, volume, Bluetooth, battery, notifications and the local clock.
  That's tide's right-hand side, native.
- **tico's toolbar icon** shows the current workspace number as its badge,
  amber when another workspace holds a window wanting attention. The icon
  is on every browser window's toolbar and pinned, and is absent in web app
  windows, which have no toolbar.
- **tico's popup**, from the icon or `Search+B`, shows nine workspaces in
  tide's bar style (current, occupied with favicons, urgent, empty), the
  layout symbol, and the clocks.
- **Where there's no toolbar**, in web app windows and tico's app popups,
  Chrome refuses to open an action popup ("Browser window has no toolbar",
  `extension_action_api.cc` `OpenPopupInBrowser`). There, `Search+B` opens
  the same page as a small `popup` window centered on the focused display.
  It floats, isn't tiled or counted, and closes when it loses focus or on
  Esc.

### 8.2 Clocks

tide's clock rules, in the popup and the home window:

- `SF`, `NYC`, `LON` and local, 24-hour, tabular figures.
- Labels are fixed place names, not CLDR names.
- A zone matching the local zone ID is hidden.
- A different day shows `−1` / `+1`.
- Each zone has a 24-hour day/night/working-hours strip.
- The next DST change is named.
- Scrolling scrubs time in 15-minute steps.
- `Intl.DateTimeFormat` with `timeZoneName: "short"` gives the abbreviation.
  CLDR gives `GMT+1` for London in en-US, so tico keeps tide's
  tzdata-abbreviation table instead.
- Settings: the same `{zone, label}` list as tide's `clocks.json`, synced
  (§13).

## 9. Launcher and app keys

### 9.1 Web apps

Each letter **activates the app's window if one exists** (§6.1, bringing
its workspace with it), **else opens it** on the current workspace:

| Key | App | How |
|---|---|---|
| `Search+G` | browser | §9.1, browser windows |
| `Search+F` | browser, second profile | §9.2 |
| `Search+Shift+G` | browser, third profile | §9.2 |
| `Search+C` | Google Calendar | installed web app |
| `Search+Shift+C` | Google Chat | installed web app |
| `Search+M` | Google Meet | installed web app |
| `Search+Y` | YouTube Music | installed web app |
| `Search+I` | IRC | installed web app, or the Linux client by shelf slot |

- **Browser windows**, for `Search+G`: these are `type: "normal"` and have
  no origin to match, so the key focuses the most recently focused normal
  window on the current workspace, and opens one with `windows.create({})`
  only when there's none. Profiles (`Search+F`, `Search+Shift+G`) follow
  §9.2.
- **Focus**, for web apps: the app's newest window whose tab URL is on the app's
  origin, and which is either `type: "app"` or a popup tico opened for that
  app. That reads the URL, so it needs the `tabs` permission.
- **Open**: `chrome.management.launchApp(id)` with the installed app's ID.
  Whether it opens web apps, rather than only legacy Chrome Apps, is
  *(unverified)*. If it doesn't, tico opens the URL with
  `windows.create({url, type: "popup"})`, which is a frameless-ish app
  window, but not the installed app. tico records that window's ID (in
  `chrome.storage`, §14.2) as the app's, so it tiles like an app window
  (§5.1) and the next press focuses it rather than opening another.
  Other popups still float.
- The app list is a setting: letter, name, URL, app ID.

### 9.2 Profiles

`browser2` and `browser3` run Chrome with separate `--user-data-dir`s.
ChromeOS has one Chrome profile per signed-in account. The choices are:

- **A second ChromeOS account**, switched with Ctrl+Alt+, and .
  *(unverified)*. Its windows are invisible to tico in the first account.
- **Chrome profiles inside the session**: reportedly gone with Lacros in
  M128 *(secondary:
  [Chrome Unboxed](https://chromeunboxed.com/lacros-is-gone-so-google-should-bring-account-switching-to-the-chromeos-browser/))*.
- **Linux Chrome in Crostini**, with `browser2`'s and `browser3`'s
  `--user-data-dir`s unchanged. They're real profiles, but Linux windows
  that tico can't tile (§12).
- **Incognito or Guest** for throwaway use.

tico binds the keys to whichever works, decided in M3.

### 9.3 Linux apps and the terminal

An extension can't start a Linux app. The keys that run Linux apps (`T`
terminal, `W` terminal on the workstation, `E` files, `N` notepad, `R`
remote desktop, `B` headphones) use the **shelf**: the checklist pins them
in a fixed order, and **Alt+1…8** launches shelf item N *(unverified on
current builds)*. If the Shortcuts app lets "launch shelf item N" take an
extra combo, `Search+T` and the rest map there; that's
*(unverified)* and is checked in M2.

### 9.4 The launcher

The native launcher stays: tap Search, type, Enter. It searches apps,
files, settings and the web. What's missing from tide §8:

- **Quick actions**: screenshot, lock and so on are native keys instead.
- **Launcher scripts**: tico's commands appear in it only as the extension
  itself.

tico adds nothing here. A launcher of its own would be a popup window that
only opens from a Chrome window, which is worse than the native one.

## 10. Focus cue, focus and attention

### 10.1 The dim

- tico injects a content script into the visible tab of every **unfocused**
  tiled window. It adds a full-page overlay at 7% black, ignoring the
  pointer, at the top of the stacking order.
- The focused window's overlay goes the instant focus arrives.
- No dim when the workspace has one visible window, over fullscreen video,
  or in PiP, as in tide §6.2.
- **It covers the page only.** The tab strip, toolbar and the web app title
  bar stay undimmed. `chrome://` pages, the Web Store and the PDF viewer
  can't be injected, so they never dim.
- **It costs the "read and change all your data on all websites" permission**
  (`<all_urls>` host access plus `scripting`). That's the warning users
  rightly fear. So the dim is **optional**, off by default, and requested
  at runtime when you turn it on.

### 10.2 Focus

- ChromeOS has **no focus follows mouse**, and nothing can add it. KDE's
  `FocusFollowsMouse` is the one KDE behavior that can't be carried over.
- tico never focuses a window you didn't ask for. It focuses only on its
  own keys, a workspace switch, or a close (the next window in the stack).
- Whether a new window takes focus is ChromeOS's call. Chrome windows you
  open do; tide's "a window from another app opens dimmed and urgent" has
  no equivalent.

### 10.3 Attention

Chrome on ChromeOS doesn't raise urgency for web notifications, and tico
can't see other sites' notifications. tide's §14.4 derives attention from
notifications; tico derives it from **page titles** instead:

- Gmail, Chat and Calendar put an unread count in the title, like
  `Chat (3)`. A content script on those origins, and only those, watches
  the title and tells tico when the count goes up.
- tico marks the window: the badge goes amber (§8.1), the workspace is
  marked in the popup, and `windows.update({drawAttention: true})` flashes
  its shelf icon.
- `Search+Tab` activates the most recent mark (§6.1); again goes to the next, as in
  tide §14.3. With nothing marked, it goes to the last window you were in.
- A mark clears when the window is focused.
- The watched origins are a setting. These narrow host permissions don't
  need the all-sites warning.

## 11. The rest of the desktop

All native, set from the checklist (§3.4). tico owns none of it.

- **Notifications**: the ChromeOS notification center keeps history and has
  Do Not Disturb. Chrome web notifications show there with the site.
  Automatic DND while presenting is *(unverified)*; if ChromeOS doesn't,
  tico doesn't either.
- **Idle and lock**:
  - Settings › Power picks what happens when idle (sleep, display off, or
    keep on) on charger and on battery. The display-off and lock delays are
    fixed by the OS *(unverified)*, so tide's 2:30 / 5:00 / 5:30 / 30:00
    timeline is approximated, not matched.
  - "Lock when sleeping" on, as tide locks before sleep.
  - **Keep awake** is tico's: a popup toggle that calls
    `chrome.power.requestKeepAwake("display")` until you turn it off or log
    out, like tide's. Meet already keeps the screen on by itself.
- **Screenshots**: Ctrl+Show windows for the screen, Ctrl+Shift+Show
  windows for the capture tool's window and region modes. Shots are copied
  to the clipboard and saved to Downloads, as tide saves to
  `~/Pictures/Screenshots`; the save folder is a setting. The Shortcuts
  app adds `Print`-style combos if the keyboard has one.
- **Screen sharing**: Meet's picker offers a tab, a window or the whole
  screen. tide's 16:9 slice of an ultrawide has no native equivalent;
  sharing a window is the workaround, as tide's default on an ultrawide.
- **Theme**: Personalization › Dark mode › Auto follows sunset and sunrise.
  Chrome and web apps follow it. tide's fixed 07:00–19:00 schedule isn't
  offered *(unverified)*.
- **Keyboard**: US Dvorak; Caps Lock remapped as the checklist says (there's
  no Compose, so Escape or Ctrl is the choice); key repeat in Settings.
- **Mouse**: Settings › Mouse, per device: swap primary button,
  speed 5 with acceleration on, and "Controlled scrolling" with scroll
  speed 5. §19.2 has the numbers and the finer route.
- **Fonts**: Ubuntu Mono inside Linux. ChromeOS UI fonts aren't settable.

## 12. Linux apps (Crostini)

Crostini runs kitty, the shell config and the terminal tools, so `conf` and
`setup` apply there like on any Debian machine.

- Each Linux window is its own ChromeOS window, managed by the OS and
  invisible to tico. They get native snap and float, not tiling.
- **Nested tiling, as an option**: sway (or cage running kitty) inside one
  Sommelier window would tile Linux windows among themselves *(unverified:
  no report found of sway nested under Sommelier)*. The outer window is
  still a Linux window, invisible to tico, so it doesn't join tico's layouts
  or workspaces. It's placed with native snap or float, or kept
  fullscreen. It's worth trying only if Linux apps become the main work.
  Baguette, the containerless Crostini that is default for new installs from
  M147 *(secondary)*, lists graphics acceleration among things no longer
  supported, so a nested compositor may be slow.
- `setup` gains a Crostini mode in `scripts` (§15): the packages, kitty and
  conf, without a desktop session.

## 13. Settings

- One **options page**, in the style of tide's settings panel, with pages
  for layouts, workspaces, keys (with the checklist), apps, clocks, dim and
  attention.
- Every change applies live; no reload.
- **Shared vs per-machine**, as tide's §16.1: `chrome.storage.sync` holds
  the shared settings (apps, clocks, keys, layouts), and
  `chrome.storage.local` holds per-machine overrides (lone-window width per
  display, ultrawide threshold). Objects merge key by key; lists replace
  whole.
- A bad value is an error on the options page naming the setting, and the
  last good value stays.
- Import and export as JSON, in the same shape as tide's
  `~/.config/tide/*.json`, so one clocks list and one layouts file serve
  both.

## 14. The extension

### 14.1 Manifest

- MV3, service worker background, minimum Chrome version set to the M2
  device's.
- Permissions: `storage`, `system.display`, `tabs` (app focus, URL rules),
  `power` (keep awake), `management` (launching installed apps, if §9.1
  holds), `scripting` plus narrow host permissions for the attention
  origins.
- Optional permission, asked at runtime: `<all_urls>` for the dim.

### 14.2 Living with the service worker

- **Every listener is registered synchronously at the top of the worker**,
  before any `await`, so the event that wakes a sleeping worker is handled.
  This is the fix for chrometile's likely first-key bug.
- **State goes to storage on every change**: workspaces, tile order, float
  list, attention marks. Use `chrome.storage.session` for what dies with the
  browser and `chrome.storage.local` for what survives a restart.
- On wake, tico reconciles stored state with `windows.getAll`: unknown
  windows join the current workspace; vanished ones are dropped.
- Window IDs change across a browser restart. tico rebuilds workspaces
  after a restart by matching each window's tab URLs, and anything it can't
  match lands on workspace 1.

### 14.3 Cost and reliability

- **Dollars**: none to run. Publishing to the Web Store takes a one-time
  $5 developer registration *(secondary)*.
- **Latency**: no network calls. Each key is a few `chrome.windows` calls;
  a workspace switch is one minimize and one restore per window plus the OS
  animation.
- **Failure modes**:
  - A Chrome update could change how bounds or minimize behave; CI can't
    catch that, so M2's device checks are re-run on each ChromeOS major.
  - ChromeOS's Android-based successor, Googlebook OS, is already
    shipping on new laptops (§20). ChromeOS itself is reported to continue
    for enterprise and education, with updates through 2034
    *(secondary)*.
- **If tico is off or crashes**, windows stay where they are and the native
  keys still work. Nothing it does is needed to use the machine.

### 14.4 On a managed work machine

The target is a work machine, so admin policy decides parts of this before
any code does. None of these policy names or behaviors has been checked
against the policy list yet *(unverified)*; M2 reads the machine's
`chrome://policy` first.

- **Installing tico**: it comes from the Web Store (§14.5), so what matters
  is whether policy blocks Web Store extensions, or allows only a list. If
  so, the admin has to add tico's ID.
- **The dim** (§10.1) needs all-sites access, which policy can withhold from
  extensions.
- **Linux** (§12, Appendix A) can be turned off by policy, and so can USB
  passthrough and port forwarding.
- **The Shortcuts app and keyboard settings** may be locked.
- **The `#gesture-properties-dbus-service` flag** (§19.2) can't be set
  where policy blocks `chrome://flags`.

### 14.5 Distribution

tico ships on the **Chrome Web Store**; loading it unpacked is for
development only. That shapes the design *(Web Store policy, secondary)*:

- **One purpose**: window management. The clocks, keep-awake and attention
  belong to it as the desktop around the tiles; the listing says so.
- **Every permission is justified in the listing**: `tabs` for app focus
  and URL rules, `system.display` for layout, `power` for keep-awake,
  `management` for launching installed apps, `scripting` and the narrow
  attention origins for unread counts. All-sites access for the dim stays
  optional and is requested at runtime (§10.1), so the install warning
  stays small and review stays simpler.
- **No remote code** and no network calls, which MV3 requires anyway.
- Updates go through Web Store review, so a fix after a ChromeOS change
  takes days, not minutes. Keep a tested build ready before each ChromeOS
  major (§14.3).

tidal would ship on the **Play Store** (§20.4).

## 15. Where things live

| Repo | Gets |
|---|---|
| **tico** (this) | The spec. The extension: worker, layout geometry, workspaces, popup, home window, options page with the checklist, attention and dim content scripts. Its tests. |
| **tide** | Nothing changes. Its layout fixtures (window counts → rectangles) are the reference tico's geometry tests are checked against, copied with a note of the commit. |
| **conf** | The shared `clocks.json` and layouts settings, if tico imports them (§13). Crostini needs nothing new: the Debian path already covers it. |
| **scripts** | `setup` detects Crostini (`/dev/.cros_milestone` or `sommelier` on `PATH`, *(unverified)*) and skips the desktop: no KDE, no tide, no display manager. |

## 16. Milestones

| # | Milestone | Done when |
|---|---|---|
| **M1** | This spec | agreed; open questions answered |
| **M2** | Device checks + layouts | every *(unverified)* claim in §2, §7.2, §9 and §11 is checked on a Chromebook, with the ChromeOS version, and this spec updated. The four layouts and the lone-window rule tile Chrome and web app windows on the laptop panel and on an ultrawide. Frame offsets are measured and tiles meet. State survives the worker sleeping and a browser restart. |
| **M3** | Workspaces + keys | nine workspaces switch and send on one and two displays, with the home window on empty ones. Every key in §7.1 is bound or listed by the checklist. App keys focus or open each web app and profile. |
| **M4** | Popup, clocks, attention | the popup shows workspaces and urgency from live state, the clocks follow tide's rules across a DST fixture, and a Chat message marks its window and `Search+Tab` goes there. |
| **M5** | Dim + settings | the optional dim works and is off without the permission. The options page edits everything live, syncs, and imports tide's JSON. |
| **M6** | Linux | `setup` runs in Crostini; the nested-sway experiment is tried and written up, keep or drop. |

## 17. Testing

- **Pure logic in plain JavaScript modules**, run by `node --test` in CI, as
  tide does: layout geometry, workspace state transitions, settings merge
  and validation, clock labels and DST, attention title parsing.
- **Geometry fixtures** from tide's layout tests, so the two desktops tile
  the same way for the same windows.
- **A `chrome.*` fake** for the worker: windows with IDs, types, states and
  bounds, and events, so switching, sending, reconciliation after a
  restart, and a worker woken by a command are tested without a browser.
  The fake's bounds can be off by a frame, to test the offset correction.
- **Playwright with Chromium** loads the unpacked extension on Linux for
  what the fake can't show: the popup, options page and content scripts.
  Window management on Linux Chromium differs from ChromeOS, so those
  results don't stand in for M2's device checks.
- No test sleeps; events are driven in order by the fake.

## 18. Open questions

1. **Workspaces: tico's (minimize) or native desks?** §3.2 recommends tico's,
   for exact per-workspace tiling and tide's keys, at the cost of the
   minimize animation and Android/Linux windows showing everywhere.
   Native desks give OS animations and keys that work over every app, but
   tico can't see them, so it would tile every desk's windows on a display
   together: per-desk tiling breaks. A hybrid that guesses each window's
   desk from focus changes would go wrong on any native desk move, with
   nothing to correct it. So it's tico's own workspaces, unless M2 shows the
   minimize animation can't be lived with.
2. **Is the dim worth the all-sites permission?** §10.1 makes it optional,
   off by default.
3. **Fork chrometile or start fresh?** §3.1 recommends fresh, using
   chrometile until M3 and sending it two fixes.
4. **How much of the off-ramp (§3.6) should this repo document**, given the
   tide spec already covers the desktop it would run?
5. **The five moved keys** (§7.1): `Search+Space`, `Search+Shift+.` and
   `,`, `Search+Shift+I` and `D`, and `Search+Shift+Space` are placeholders.
   Better combos, from the keys §2.2 allows, are welcome. An upstream
   patch could restore `Search+Return` only (§19.1).
6. **Googlebook**: the target is a work machine. Accessibility services
   and sideloading aren't ruled out; adb is unknown. That decides whether
   tidal (§20.4) could re-tile, or only place apps at launch. The same
   machine's ChromeOS policy (§14.4) decides whether tico loads at all.

## 19. Upstream patches and workarounds

Where a limit is in Chromium code rather than in policy, a patch could lift
it. Each subsection says what it would take and whether it's worth trying.
None of tico's milestones depends on one landing.

### 19.1 More keys for extension commands

**The ask.** tide binds `Super+Return`, `Super+\`, `Super+/`, `Super+=`,
`Super+-`, ``Super+` `` and `Super+Backspace`, and no extension can
bind any of them (§2.2). Comma and period already work, which is why §7.1
uses them.

**Where the limit is** (Chromium `main` at `a3f88457`):

- `ui/base/accelerators/command.cc`:
  - `ParseImpl` turns `"Search+Shift+Period"` into an accelerator. It
    accepts a single character, but then keeps only A–Z and 0–9, plus a
    fixed list of named keys: Comma, Period, the arrows, Insert, Delete,
    Home, End, PageUp, PageDown, Space, Tab and the media keys.
  - `Command::AcceleratorToString` is a hand-written `switch` over the same
    keys, going the other way. Anything else becomes `""`.
  - `HasValidModifierCombination` requires a modifier, refuses Shift
    alone, and refuses Ctrl+Alt "because of AltGr" (the only reason the
    code gives anywhere).
- `ui/base/accelerators/command_constants.h` holds the token strings.
- `extensions/common/command.cc` wraps the parser. A manifest with an
  unknown key **fails to install**.
- `chrome/browser/extensions/commands/command_service.cc` saves a user's
  binding as `"<platform>:" + AcceleratorToString(...)`. So the two
  directions must change together, or a save writes a broken pref.
- The shortcuts page, `chrome://extensions/shortcuts`, uses the shared
  `ui/webui/resources/cr_components/cr_shortcut_input/` widget.
  `cr_shortcut_util.ts` has its own `Key` enum of the same keys, as
  `keyCode` numbers, and `isValidKeyCode` rejects the rest. It never
  captures Tab (it lets Tab move focus), and `onKeyUp_` ignores Enter.
- **Matching has no further filter.**
  `chrome/browser/ui/views/extensions/extension_keybinding_registry_views.cc`
  registers the accelerator with the `FocusManager` at high priority, by
  key code and modifiers. Once one parses, `VKEY_RETURN` or `VKEY_OEM_2`
  (slash) would fire.

**Why the limit exists.** No design note, bug or CL found states it. The
history couldn't be read (shallow clone; the Chromium Gerrit, issue tracker
and docs sites were blocked from this sandbox). The likely reason is
**keyboard layout**:

- `VKEY_OEM_*` punctuation codes follow what the layout types.
- The shortcuts page draws the US glyph whatever the layout
  (`DomCodeToUsLayoutCharacter`).
- On Dvorak, which you use, `/`, `=`, `-` and `\` sit on different keys
  than on QWERTY. `Slash` would bind the Dvorak `/` key, and display as
  whatever US key is in that position.
- Comma and Period are the most layout-stable punctuation, which fits
  them being the two let in.

**Prior art.** Firefox allows F1–F12 in `suggested_key`, and since
Firefox 135 lets users assign F13–F19, but likewise no punctuation beyond
comma and period *(secondary, MDN)*. No Chromium request or attempt was
found *(the tracker was unreachable, so this is weak evidence)*.

**A patch** is about 6–8 files plus tests, 1–2 days of careful work:

1. One `{token, VKEY}` table in `command.cc`, used by both `ParseImpl` and
   `AcceleratorToString`, replacing the duplicated `if` chain and `switch`.
   New tokens named after `KeyboardEvent.code` (`Enter`, `Backspace`,
   `F1`–`F12`, `Slash`, `Backslash`, `Equal`, `Minus`, `Backquote`).
2. Tests in `ui/base/accelerators/command_unittest.cc` and
   `extensions/common/command_unittest.cc`.
3. `cr_shortcut_util.ts`: the new key codes, behind an opt-in property so
   the widget's other user (the settings page's omnibox shortcut) doesn't
   change. `cr_shortcut_input.ts`: take Enter on keydown. Their WebUI
   tests.
4. Names for F2, F3, F5, F7–F10 and F12 in `ui/strings/ui_strings.grd`,
   since `accelerator.cc` `KeyCodeToName` lacks them.
5. The `commands.json` docs, and the "Supported keys" list on
   developer.chrome.com.

**What reviewers would push back on:**

- **Layout**, for the punctuation keys, as above. Making them safe means
  matching by physical key (`DomCode`) or by character. That's a bigger,
  cross-platform design change, not a token-list edit.
- **Stealing keys from pages.** Extension accelerators beat the page:
  Ctrl+/ comments code in web editors, Ctrl+Enter submits, Ctrl+Backspace
  deletes a word.
- **Older Chrome.** A manifest using a new token won't install on a Chrome
  that predates it, so developers would declare it per platform or not at
  all. That matters less to tico: a user-set binding is a pref, not a
  manifest key.
- **Shared code.** The widget and `ui::Command` have non-extension callers,
  including the autofill shortcut in
  `chrome/browser/renderer_preferences_util.cc`.

**Verdict:**

| Keys | Odds | Why |
|---|---|---|
| F1–F12 | fair | Firefox parity, layout-independent. On a Chromebook, F-keys are Search+top row, so it doesn't help tico much. |
| Enter, Backspace | fair | Layout-independent. Needs the Enter fix in the widget. Gives tico `Search+Return` back. |
| `\` `/` `=` `-` `` ` `` | low | Layout-dependent. Only with a positional-matching design, which would be a project in itself. |

**Recommendation.** Not on tico's critical path. If anything, file a
Chromium issue for Enter and Backspace with tico as the use case, and offer
the CL if a reviewer in `ui/base/accelerators/OWNERS` is open to it. Don't
attempt the punctuation keys. Meanwhile §7.1's combos stand, and the key
map is open to better choices (open question 5).

### 19.2 Mouse speed, acceleration and scroll speed

**What the setup asks for** (conf `config/hypr/hyprland.lua` 536–555 and
`config/hypr/scripts/apply-input.sh`):

- Pointer `sensitivity = 1.0`, libinput's fastest, with
  `accel_profile = "adaptive"`. The comment says flat and custom curves
  "felt wrong on a real session".
- Every mouse left-handed.
- Every mouse wheel at `scroll_factor = 3`, three times libinput's
  default. kitty adds `wheel_scroll_multiplier 5.0` on top.
- Touchpads: natural scrolling, tap to click, disable while typing.

**What ChromeOS offers.** The settings are per device
(`ash/public/mojom/input_device_settings.mojom`, `MouseSettings`), set in
Settings › Mouse
(`chrome/browser/resources/ash/settings/device_page/per_device_mouse_subsection.ts`):

- swap primary button;
- cursor acceleration, on or off;
- pointer speed, **five steps** (`ticks = [1, 2, 3, 4, 5]`), default 3;
- reverse scrolling;
- "Controlled scrolling", which turns scroll acceleration off;
- scroll speed, five steps, **only while Controlled scrolling is on**.

Chrome writes them to the input stack as libgestures properties
(`ui/events/ozone/evdev/input_device_factory_evdev.cc` 329–366). The
curves are in libgestures, read here from an AOSP mirror of it
(`platform.external.libchrome-gestures`) and assumed to match ChromeOS's
copy *(unverified)*:

- **Pointer, acceleration on**: five fixed curves
  (`kMaxAccelCurves = 5`, `accel_filter_interpreter.h`).
- **Pointer, acceleration off**: one slope per step,
  `{2, 4, 8, 16, 24}` (`accel_filter_interpreter.cc` 132). Each step
  doubles the speed, so there's nothing between them.
- **Wheel, Controlled scrolling on**: a fixed offset per notch,
  `{20, 36, 72, 112, 164}` (`mouse_interpreter.cc` 239).
- **Wheel, acceleration on** (the default): the speed slider is ignored.
  The offset per notch follows a curve in wheel velocity, small when slow,
  large when spun.

**What maps.** Speed 5 with acceleration on is the nearest to
`sensitivity 1.0` adaptive. Controlled scrolling at speed 5 gives 164 per
notch against 72 at the middle step. That's 2.3× the middle step,
close to the 3× target, if you accept losing the faster spin.
Left-handed is the button swap. Touchpad natural scrolling is native. The
finer steps and the exact 3× aren't offered in Settings.

**Finer than Settings**, most practical first:

1. **`gesture_prop` in crosh.**
   - It needs `chrome://flags/#gesture-properties-dbus-service`
     (`kGesturePropertiesDBusService`, off by default). The D-Bus policy
     admits the `chronos` user, so developer mode doesn't seem to be
     needed. Whether crosh offers the command outside developer mode is
     *(unverified)*.
   - It sets properties Chrome never writes, so Settings doesn't
     overwrite them:
     - `Mouse CPI` (default 1000): lower is faster, in continuous steps;
     - `Mouse Pointer Accel Curve`, with
       `Use Custom Mouse Pointer Accel Curve`;
     - `Mouse Scroll Accel Curve`: scaling its five coefficients by 3
       makes accelerated scrolling 3× faster and keeps the spin.
   - **It's per device and per boot.** The values most likely reset on
     reboot, resume or replug *(unverified)*, and nothing re-applies them
     automatically. It suits an experiment, not a daily setting.
2. **Developer mode**, with rootfs verification off: a file in
   `/etc/gesture/` (read at startup, `gesture_property_provider.cc`)
   makes the same properties stick. It costs verified boot, and updates
   overwrite the rootfs. That's the off-ramp (§3.6), not tico.
3. **Web pages only**: extensions can rescale wheel events in pages, not
   in the shell or Linux apps. That's a poor fit.
4. **Linux apps**: exo converts ChromeOS's offset to Wayland axis units
   (`components/exo/wayland/wayland_pointer_delegate.cc`). Sommelier has
   no scroll-scale option (`vm_tools/sommelier/sommelier-seat.cc`), so
   per-app multipliers, like kitty's, are the tool.

**No extension API or policy** reaches these. `settingsPrivate` is for
component extensions, and its allowlist has no mouse prefs. The only
mouse policy is the primary-button swap.

**A patch** would span two repos:

- libgestures, for more curves or a continuous value;
- Chromium, for the slider ticks, mojom ranges, clamps, metrics that
  assume 1–5, and tests.

A cheaper version is a "flat speed" and a "scroll multiplier" that map
onto `Mouse CPI` and the scroll curve. Either way it's 1–2 weeks of work
plus review across ash settings, ozone and gestures, and an outside patch
is unlikely to land. The five steps are a product choice by the ChromeOS
peripherals team, though a flag or an accessibility framing would help.
**And it wouldn't reach this Chromebook** until it shipped, since a
patched Chrome needs developer mode and a custom image. No existing
request was found *(issue tracker unreachable)*.

**Recommendation.** Use Settings: speed 5, acceleration on, button swap,
Controlled scrolling at 5. Try `gesture_prop` once, to see whether
`Mouse Scroll Accel Curve` ×3 feels like home and whether it survives a
reboot, and record the result in M2. Don't patch.

## 20. Googlebook OS (tidal)

ChromeOS's successor, codenamed Aluminium, is Android-based. If tico ever
follows it, the port is **tidal**. This section records what that OS
allows, so tico's core is built to carry over. Checked 2026-10-23. The
Android sites, news sites and Google hosts were mostly unreachable from
the sandbox, so most dates here are *(secondary)*.

### 20.1 Status

- **Timeline** *(secondary)*:
  - Google announced the ChromeOS and Android merger in 2025.
  - It announced the **Googlebook** laptop brand on 2026-05-12, with Acer,
    ASUS, Dell, HP and Lenovo.
  - It named the OS **Googlebook OS** in September 2026.
  - Laptops went on sale in the US in early October 2026.
- developer.android.com lists Googlebook as a device category: existing
  Android apps "will work on Googlebook"
  ([verified](https://developer.android.com/googlebook)).
- It's reported to be based on Android 17 *(secondary)*.
- **Existing Chromebooks**: "many" newer ones, mostly commercial models,
  will be able to switch, with no list yet. ChromeOS continues for
  enterprise and education, with updates through 2034 *(secondary)*.

### 20.2 What it offers natively

From AOSP `android16-qpr1-release`, on the GitHub mirror; Android 17 source
isn't public yet:

- **Snapping, not tiling**: snap left or right half, maximize, minimize,
  move to the next display. WM Shell's `windowdecor/tiling` is a two-window
  pair with a divider. There's no master/stack and no automatic layout.
- **Desks**, switched by key, with a basic UI *(secondary)*.
- **Shortcuts**: you can rebind system actions in Settings, as long as each
  includes the G key *(secondary)*. Apps can't add their own; the API needs
  `MANAGE_KEY_GESTURES`, a signature permission.

### 20.3 What a third-party app can do

| Need | Possible? | How | Caveats |
|---|---|---|---|
| List every window with its bounds | yes | `AccessibilityService.getWindowsOnAllDisplays()` | Play makes apps declare accessibility use. Android 17's opt-in Advanced Protection blocks services not marked as accessibility tools *(secondary)*. |
| **Global keys** | likely | accessibility `onKeyEvent` with key filtering, which sees keys before apps and before the system's key gestures (AOSP `KeyboardInterceptor`) | Not tried on a Googlebook. This is what ChromeOS lacks (§2.2). |
| Place a window when launching it | yes | `ActivityOptions.setLaunchBounds()` | Launch time only; the system may adjust. |
| Move or resize another app's running window, public API | **no** | none. Android 17's `AppTask.moveTaskTo` moves only the caller's own tasks, and needs a role only the default browser gets. | none |
| Move or resize it through Shizuku or adb | yes | `IActivityTaskManager.resizeTask`, `setTaskWindowingMode`; the shell user holds `MANAGE_ACTIVITY_TASKS` | Hidden APIs that break between releases. Shizuku needs re-arming over wireless debugging after each reboot. Enterprise policy can disable adb, which ends it. |
| A bar | overlay only | an overlay window or a home app | The window decorations, taskbar and desks belong to SystemUI. |
| Chrome extensions | yes | Googlebook's Chrome runs extensions *(secondary)*. Chromium builds `commands` and `windows` for desktop Android (`chrome/browser/extensions/api/BUILD.gn`). | Still only Chrome's windows, and still no global commands. Changing bounds needs Chrome to be the default browser and the window to be freeform (`windows_api.cc`). |
| Linux GUI apps | not yet | The Terminal app's Debian VM is CLI-only today. GUI apps and GPU are planned *(secondary)*. | none |

**Prior art.**
[Aypex/android-tiling-wm](https://github.com/Aypex/android-tiling-wm)
(Apache-2.0, v0.1.0) tiles with Shizuku plus accessibility events: master
and stack, rows, monocle. It reports working on Android 17 on a Pixel, after
two breakages. It has no workspaces and no keyboard control yet.

### 20.4 What it means for tico

- **tidal could tile every app**, not just Chrome's, and catch keys
  globally. That's more than tico can ever do on ChromeOS. The price is
  Shizuku: developer options, re-arming after each reboot, and hidden APIs
  that move every release.
- **It ships on the Play Store.** That means declaring the accessibility
  use and passing Play's review of it, including the 2026 rule against
  apps that act autonomously *(secondary)*. Apps that use Shizuku are on
  Play today *(unverified)*, but Play could still object to the hidden
  APIs. The accessibility-only tier (global keys, placing apps at launch)
  is the safer listing; the Shizuku tier is opt-in inside it.
- **A managed laptop is the deciding question.** If policy disables
  developer options or adb, tidal falls back to accessibility only: global
  keys, and placing apps at launch, but no re-tiling of running windows.
- **The shared core is cheap insurance.** tico's geometry, workspace state
  machine (§6.1), settings schema and key-map model are already specified
  free of `chrome.*` (§5.2, §17). tidal would reuse them unchanged behind an
  accessibility service and a Shizuku layer. So tico does nothing for
  Googlebook now beyond keeping that line clean.
- **Upstream is a poor bet.** AOSP has developed in private since 2025, and
  publishes source twice a year *(secondary)*. A WM Shell patch would land
  on code months stale. Not worth trying.
- **The Chromium key patch** (§19.1) still applies to both, since the
  commands code is shared with desktop Android. But tidal's accessibility
  keys make it matter less there. It stays optional.

## Appendix A: the rest of the setup

Everything else in `mikelward/conf` and `mikelward/scripts`, and what
ChromeOS can do with it. The desktop pieces are in §4; this is the rest.

- **Crostini**: works inside Linux on ChromeOS.
- **Native**: ChromeOS has its own equivalent.
- **Partial** or **no**: the gap is named.

Unmarked claims come from reading the configs and scripts.
*(unverified)* marks ChromeOS behavior not yet checked on a device.

### A.1 Works in Crostini

| What | Notes |
|---|---|
| Shells and prompt: zsh, bash, fish, nushell, Elvish, mesh, ksh (`shrc`, `shrc.vcs`, `config/{fish,nushell,elvish,mesh}`), the `vcs` binary | The Terminal app opens the container user's login shell, so `chsh` to zsh works *(unverified)*. crosh isn't a real shell; not a target. |
| `env`, `config/environment.d` | The container runs a systemd user manager (garcon runs under it), so apps from the launcher should get the environment *(unverified)*. |
| readline and tool rc files (`inputrc`, `editrc`, `exrc`, `nanorc`, `gdbinit`, `screenrc`, `muttrc`, …) | Affect Linux apps only. |
| kitty, sakura | kitty needs OpenGL 3.3. Classic Crostini has virgl where the board supports it. Baguette drops GPU support, so kitty would render on the CPU through llvmpipe *(unverified)*. kitty's auto light/dark likely doesn't see ChromeOS's dark mode *(unverified)*. |
| vim, nvim, helix, emacs, Sublime Text; `codeedit`, `idea`, `makemakefile`, `precommit` | GUI editors run as their own ChromeOS windows. `homepkg` handles aarch64 for ARM Chromebooks. |
| tmux, shpool, `sessionlib` and the session scripts | `setup`'s systemd user unit works. Sessions outlive a closed Terminal window but not a ChromeOS reboot or a Linux shutdown *(unverified)*. |
| git, hg, jj and their config; `gitbackup`, `confinst`, `confdist`, `homepkg`, `package` | The container's `$HOME` is separate from ChromeOS's files. Share through "Linux files" or a shared folder. |
| atuin, lf, fzf, zoxide, rg, fd, bat, delta, gh, uv; the small utilities (`args`, `clocks`, `filter`, `total`, …) | `diskspace` and `diskuse` report the VM's disk, not ChromeOS's. `mailifnotempty` needs an MTA. |
| ssh config, `set-ssh-alias`, `terminal_on`, `terminal_on_workstation` | ssh-agent works per container. |
| Agent config (`conf/claude`, `conf/gemini`, `conf/agents`) | The CLIs run in Linux. |

### A.2 Native on ChromeOS instead

| What | ChromeOS has |
|---|---|
| `bluetooth-connect` | Quick Settings › Bluetooth. The container has no Bluetooth stack. |
| `vol`, `playpause`, `media` | Media and volume keys, Quick Settings. pactl in the container moves only its own stream. |
| `pulseprofile.py`, `pa.py` | The Quick Settings audio output and input picker. |
| `connect`, `showconn` (nmcli) | Settings › Network. The container has its own virtual network. |
| `external_monitors_only`, `monitor-hotplug.sh` | Settings › Displays, and docked mode with the lid closed *(unverified)*. |
| `left`, `right` (button swap) | Settings › Mouse › Swap primary button, per device (§19.2). |
| `lock-screensaver`, `screensaver`, `xsecurelockrc` | The lock screen and screen saver. |
| `devilspie`, `moveto`, `snap` | Desks and snapping, or tico. |
| `gmail`, `google-calendar`, `google-chat`, `google-meet`, `music`, `discord`, `remote-desktop` | Installed web apps (§3.5, §9.1). |
| `home` | The Files app. |

### A.3 Partial

| What | Gap |
|---|---|
| US Dvorak with Caps Lock as Compose (`setup` `configure_keyboard`, `dvorak`, `dvorak.kmap`) | Dvorak is native. There's no Compose key anywhere in ChromeOS *(unverified)*. In Crostini, `setxkbmap compose:caps` affects only X apps, and may map them differently from Wayland apps *(unverified)*. |
| espanso | Its Wayland backend needs evdev and uinput, which Crostini doesn't expose. Its X11 backend could expand inside X apps only *(unverified)*. Text-expander extensions work only in web pages. |
| `xbindkeys`, `xmodmaprc`, `imwheelrc`, `Xdefaults`, `kev` | X apps under Xwayland only, while one has focus. |
| `chrome` and `browser1`–`3` run from Linux | They start a Linux Chrome, if one is installed. To send plain links to the ChromeOS browser instead, point `BROWSER` at `garcon-url-handler` *(secondary)*. `--app=` can't go that way. |
| `pidcat`, adb | adb reaches ChromeOS's own Android from Crostini once ADB debugging is on in Settings › Linux, which may need a powerwash *(secondary)*. A USB phone needs per-device USB passthrough. |
| `chrome-remote-desktop-session` | Controlling other machines works. Hosting from a consumer Chromebook is Remote Support codes only; unattended access is an admin policy *(secondary)*. |

### A.4 Not possible

| What | Why |
|---|---|
| sway, Hyprland, i3, qtile, xmonad, wingo; waybar, polybar, xmobar, dunst, swaync, fuzzel, swaylock, compton, uwsm, tide | Linux windows are guests of ChromeOS's window manager. A WM can only run nested in one window (§12). |
| `xinitrc`, `xsession`, `xsessionrc` | There's no X session to start. |
| `ddcinput` | No i2c in the container, and no DDC control in ChromeOS *(unverified)*. |
| `amethyst.yml`, `setup-macos`, karabiner | macOS only. ChromeOS's per-keyboard modifier remapping covers the basic swaps. |

### A.5 `setup` in Crostini

`setup` doesn't know about Crostini today. Line numbers are from
`mikelward/scripts` `main` on 2026-10-23.

- `detect_os` (695–713) sees apt and picks `debian`. Sommelier sets
  `DISPLAY` and `WAYLAND_DISPLAY`, so `have_display` (720–728) turns the
  GUI on.
- `install_packages` (978–996) then installs KDE and Plasma with their
  recommends: gigabytes on a default Linux disk of about 10 GB, possibly
  pulling in sddm, which can't run in the container *(unverified)*.
- `setup-kde` runs against a session that doesn't exist. `--tide` would
  try to install Hyprland and greetd.
- `configure_keyboard` (2169–2215) writes `/etc/default/keyboard`, which
  does nothing with no VT. Its `setxkbmap … dvorak compose:caps` affects
  X apps only.
- `keep_display_gpu_awake` (2283–2330) finds no matching GPU and does
  nothing, but shouldn't run.
- `MIN_DISK_GB=15` (125) would quietly force the minimal profile and skip
  helix, jj and nushell.
- `gpasswd -a "$USER" root` (2486–2492) isn't needed; the Crostini user
  already has sudo *(unverified)*.
- What works: fonts, kitty, the shpool unit (1394–1455), `make -C root
  install`.

**A Crostini mode would:**

- detect Crostini (`/dev/.cros_milestone` or `/opt/google/cros-containers`,
  *(unverified for Baguette)*);
- keep kitty and fonts, but skip KDE, `setup-kde`, tide, the keyboard
  config, the GPU rule and the root group, printing what to set in ChromeOS
  Settings instead;
- set `BROWSER` to `garcon-url-handler`, and teach `chrome` to hand plain
  URLs to the ChromeOS browser;
- explain the disk-size cutoff, pointing at Settings › Linux › disk size;
- warn on Baguette that kitty will render on the CPU;
- come with a `setup_test` case, listed in the `Makefile`'s `test` target.

That's a `scripts` PR of its own, once this spec is agreed (§15).

## Sources

Checked 2026-10-23:

- Chromium `main` at `a3f88457` (major 158), via the
  [GitHub mirror](https://github.com/chromium/chromium):
  `chrome/common/extensions/api/windows.json`,
  `chrome/browser/extensions/browser_extension_window_controller.cc`,
  `chrome/browser/extensions/api/tabs/windows_util.cc`,
  `extensions/common/api/system_display.webidl`,
  `extensions/common/api/commands/commands_handler.cc`,
  `ui/base/accelerators/command.cc`,
  `chrome/browser/extensions/extension_commands_global_registry.cc`,
  `ui/base/ime/ash/input_method_ash.cc`,
  `chrome/common/extensions/api/_permission_features.json`,
  `extensions/common/api/_manifest_features.json`,
  `chromeos/ash/experiences/extensions/common/api/_permission_features.json`,
  `ash/public/cpp/accelerators.h`,
  `ash/webui/shortcut_customization_ui/backend/accelerator_layout_table.cc`,
  `ash/constants/ash_features.cc`,
  `ash/wm/tile_group/window_tiling_controller.h`,
  `chrome/common/chrome_features.cc`
- For §19: `ui/base/accelerators/command_constants.h`,
  `extensions/common/command.cc`,
  `chrome/browser/extensions/commands/command_service.cc`,
  `ui/webui/resources/cr_components/cr_shortcut_input/`,
  `chrome/browser/ui/views/extensions/extension_keybinding_registry_views.cc`,
  `ash/public/mojom/input_device_settings.mojom`,
  `chrome/browser/resources/ash/settings/device_page/per_device_mouse_subsection.ts`,
  `ui/events/ozone/evdev/input_device_factory_evdev.cc`,
  `components/exo/wayland/wayland_pointer_delegate.cc`
- libgestures via the AOSP mirror
  [platform.external.libchrome-gestures](https://github.com/msft-mirror-aosp/platform.external.libchrome-gestures):
  `accel_filter_interpreter.{h,cc}`, `mouse_interpreter.cc`;
  ChromiumOS platform2: `vm_tools/sommelier/sommelier-seat.cc`,
  `crosh/crosh` (`gesture_prop`)
- [chrometile](https://github.com/brockgr/chrometile) at `af8e367`
  (2026-10-13)
- [Quilt](https://github.com/MrViolets/Quilt),
  [chromewm](https://github.com/JayGoldberg/chromewm),
  [virtualdesktops-extension](https://github.com/google/virtualdesktops-extension)
- [crouton](https://github.com/dnschneid/crouton) README and commit
  `59e36db` (end of life, 2024-12-31)
- *(secondary)* [ChromeOS developer news](https://developers.google.com/chromeos/app-development/develop/news)
  for Baguette; [Chromebook keyboard shortcuts](https://support.google.com/chromebook/answer/183101);
  [9to5Google on Lacros](https://9to5google.com/2024/07/12/chromeos-lacros-ending/);
  [Aluminium OS](https://en.wikipedia.org/wiki/Aluminium_OS)
- tide's [SPEC.md](https://github.com/mikelward/tide/blob/main/SPEC.md) and
  `mikelward/scripts`' `setup-kde` for the behavior being matched
