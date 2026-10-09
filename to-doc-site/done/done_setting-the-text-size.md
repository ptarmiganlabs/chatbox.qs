<!--
Published 2026-10-09 in ptarmiganlabs/chatbox.qs-docs#7, on /v0.6/usage/ ("Density and text size"),
with the options in the Reference (ptarmiganlabs/chatbox.qs-docs#6). Corrected: the sizes are nine — 10, 11, 12,
13, 14, 16, 18, 20 and 24 px — not a range (src/highlight/settings.js:23); day separators and
the details scale too. Softened: the bar's choice is described as not saved rather than
lasting "for as long as the object is open", since it lives in the rendering component and
is lost when the object redraws from scratch. Not published: the theme-font fix in the
notes, which shipped in 0.6.0, before the site's first line.
-->

# Setting the text size of a conversation

_Requires Chatbox.qs 0.6.0 or later._

## What changed

The conversation's text size used to be whatever **Density** resolved to: 13, 12 or 11 pixels, with
no way to ask for larger. It is now a setting of its own, and a control a reader can change:

- **Appearance → Text size** sets what a reader starts with. **Follow density** — the default — keeps
  the old behaviour exactly. The other choices are **10 px** to **24 px**.
- **Text size** in the bar above the conversation is the reader's own, for as long as they have the
  object open. It gives way the moment the setting itself changes, so a developer who changes the
  size is not overruled by a reader's old preference.
- **Appearance → Show text size control** takes the control out of the bar. It is on by default.

The size applies to the conversation itself: the message bodies, the names, the times, the badges
and the kind chips, all in proportion.

## What it does not change

- **The bar keeps its own size**, so the controls never move under the pointer while a reader tries
  sizes.
- **Density** still decides spacing, padding and the size of the avatars. Text size and density are
  now independent of each other.
- Lane headers, banners and notices stay at the bar's size.
- **An image or PDF export uses the setting, not a reader's pick.** A snapshot records where the
  reader was and what they had open; how large they liked the text is theirs, not the export's.

---

## Notes for the publishing pass — remove before publishing

- Shipped in ptarmiganlabs/chatbox.qs#61. Backfilled.
- The same release fixed a long-standing defect: the theme's font family had never been applied to
  the conversation, because two settings fought over one style property and the browser discarded
  the result. A sheet whose theme sets a font will now show that font in the conversation for the
  first time. Worth one sentence somewhere a reader who notices it would look — possibly a release
  note rather than this page.
