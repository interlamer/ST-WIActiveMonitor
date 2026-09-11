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

In SillyTavern, open the **Extensions** panel (puzzle piece icon), click
**Install extension**, and paste this repository's URL. Then open the
Extensions panel again to find "WI Active Monitor" and its settings drawer.

## Setup

1. In the extension's settings drawer, use the "Books to monitor" search
   box to pick which World Info books to watch — type to filter, click a
   result to add it as a chip, click the × on a chip to remove it. Nothing
   is watched by default; you opt books in explicitly.
2. A widget appears (bottom-right by default, expanded) showing every
   currently-enabled entry in the books you're watching, grouped by book.
3. **Drag** the widget by its header to move it anywhere on screen — it
   remembers where you leave it.
4. Click the header's chevron to **collapse** it down to just a warning icon
   and a count, or expand it back. Both states are still draggable, and the
   collapsed/expanded choice is remembered too.
5. If nothing is currently toggled on, the widget hides itself entirely
   (this is the default — uncheck "Hide widget when nothing is active" if
   you'd rather it always stay visible showing "0").

Other settings:

- **Auto-refresh every N seconds** — the widget also updates immediately
  whenever World Info data changes or the chat switches, but a periodic
  refresh is included as a safety net (set to `0` to rely purely on those
  events).
- **Refresh now** — manual refresh button.
- **Reset to default corner** — snaps the widget back to the bottom-right
  in case you drag it somewhere awkward or off-screen after resizing your
  browser window.
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

- Entry names come from the entry's "Comment/Title" field, falling back to
  its first primary key, then to `Entry #<uid>` if neither is set.
- Settings are stored per SillyTavern user profile via the standard
  extension settings mechanism (not per-chat), so your watched-book
  selection persists across chats and characters.
