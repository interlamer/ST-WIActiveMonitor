# WI Active Monitor

A small SillyTavern UI extension that watches one or more World Info (lorebook)
books you pick, and shows a bubble whenever any entry in them is currently
**enabled** (i.e. not toggled off) — so you stop forgetting to switch things
back off.

The panel looks like:

```
WI entries active

Settings: 2 (Winter Court Rules, House Rules)
NPCs: 3 (Captain Ilyra, The Broker, Old Man Weiss)
```

## Install

### Option A: SillyTavern's built-in installer (recommended)

This extension's files already sit at the root of this folder (no nested
subfolder), which is what SillyTavern's Git-based installer expects. To use
it:

1. Publish this folder as its own public GitHub repository — see
   "Publishing to GitHub" below if you haven't done that part yet.
2. In SillyTavern, open the **Extensions** panel (puzzle piece icon) and
   click **Install extension**.
3. Paste your repository URL, e.g. `https://github.com/<you>/<repo-name>`,
   and confirm.
4. SillyTavern clones it straight into its third-party extensions folder.
   From then on, the extension manager can check for and pull updates for
   you whenever you push new commits.

### Option B: Manual copy

If you'd rather not use GitHub, copy this folder into your SillyTavern
installation at:

```
SillyTavern/public/scripts/extensions/third-party/wi-active-monitor/
```

(so that `manifest.json`, `index.js`, and `style.css` sit directly inside
that folder), then restart SillyTavern or hard-refresh the browser tab
(Ctrl+F5) if the server is already running.

### Either way

Open the **Extensions** panel and confirm "WI Active Monitor" is enabled.
Its settings drawer will appear there too.

## Publishing to GitHub

Before your first push, open `manifest.json` and replace the placeholder
`homePage` URL with your actual repo URL (and update `author` if you'd
like). This isn't required for the installer to work, but it's what shows
up in SillyTavern's extension manager.

Then, to create the repo and push — the short version:

```bash
cd wi-active-monitor
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<you>/<repo-name>.git
git push -u origin main
```

Then use Option A above to install it. To publish an update later, edit the
files, bump `version` in `manifest.json`, and:

```bash
git add -A
git commit -m "Describe your change"
git push
```

SillyTavern's extension manager will pick up the new commit next time you
check for updates (or automatically, since `auto_update` is enabled in the
manifest).

## Setup

1. In the extension's settings drawer, tick the checkboxes for the World
   Info books you want it to watch, under "Books to monitor". Nothing is
   watched by default — you opt books in explicitly.
2. A small bubble will appear (bottom-right by default) whenever any entry
   in a watched book is enabled. Click it to open the full list, grouped by
   book, with each entry's name.
3. If nothing is currently toggled on, the bubble hides itself (this is the
   default — uncheck "Hide bubble when nothing is active" if you'd rather it
   always stay visible showing "0").

Other settings:

- **Bubble position** — bottom-right / bottom-left / top-right / top-left,
  in case it overlaps something else in your theme.
- **Auto-refresh every N seconds** — the bubble also updates immediately
  whenever World Info data changes or the chat switches, but a periodic
  refresh is included as a safety net (set to `0` to rely purely on those
  events).
- **Refresh now** — manual refresh button.
- **All / None** next to "Books to monitor" — quickly select or clear every
  known book. The rotate icon rescans for newly created books.

## How it decides what's "active"

For each watched book, it reads every entry and treats it as active if its
individual enable/disable toggle (the switch in the corner of each entry in
the World Info editor) is **on** — regardless of whether the entry is
constant, selective, vectorized, etc. That toggle is exactly the one people
use to manually flip static entries (settings, NPCs, items) on and off, which
is what this extension is meant to help you keep track of.

It does **not** try to detect keyword-triggered activations during
generation — just the manual on/off state of each entry, since that's the
thing that's easy to forget about.

## Notes / limitations

- This reads SillyTavern's extension context API (`SillyTavern.getContext()`),
  specifically `getWorldInfoNames()` and `loadWorldInfo()`, plus the
  `WORLDINFO_UPDATED` / `WORLDINFO_SETTINGS_UPDATED` events. These are part
  of the documented extension API, but internal World Info internals can
  change between SillyTavern releases — if the bubble stops updating after
  an update, check the browser console for errors from `[wiActiveMonitor]`.
- Entry names come from the entry's "Comment/Title" field, falling back to
  its first primary key, then to `Entry #<uid>` if neither is set.
- Settings are stored per SillyTavern user profile via the standard
  extension settings mechanism (not per-chat), so your watched-book
  selection persists across chats and characters.
