<!--
Published 2026-10-09 in ptarmiganlabs/chatbox.qs-docs#7, on /v0.6/usage/searching/ ("Stepping"),
with the keys in the Reference (ptarmiganlabs/chatbox.qs-docs#6). Corrected against src/ui/ChatLog.jsx: the
overview ruler shows find matches while something is typed and the highlights otherwise,
never both (:369-372); Escape on a message closes the details, then lets go of the stepped
place, then leaves the object, and never clears the search, which only Escape in the find
box does (:730-744, 798-806). Dropped: that F3 and Ctrl+G changed meaning in 0.6.0 — history
before the site's first line, so no callout either.
-->

# The find box and the keywords step separately

_Requires Chatbox.qs 0.6.0 or later. F3 and Ctrl+G changed meaning in this release._

## What changed

The object has two things to step through — what you typed in the find box, and the keywords
highlighted from a field — and until 0.6.0 one pair of buttons stepped both of them. **F3** meant
the search matches while something was typed, and the highlights otherwise: one key with two
meanings, decided by a box you may not have been looking at.

They are now two navigators, each with its own buttons, its own counter and its own place:

| Keys                                                                | What they do                              |
| ------------------------------------------------------------------- | ----------------------------------------- |
| **Ctrl+F** (**Cmd+F**)                                              | Goes to the find box, from in the object. |
| **Enter** / **Shift+Enter** in the find box                         | The next or the previous match.           |
| **F3** / **Shift+F3**, **Ctrl+G** / **Ctrl+Shift+G** (Cmd on a Mac) | The next or the previous **find match**.  |
| **Alt+↓** / **Alt+↑**                                               | The next or the previous **keyword**.     |

**F3 and Ctrl+G now mean the find box and nothing else.** If you have been using them to step
keywords, that is **Alt+↓** and **Alt+↑** from this release on.

Both navigators wrap around at either end, and the one you stepped to last is the one outlined, so
stepping one of them does not make you lose your place in the other.

## What it does not change

- The **overview ruler** still shows both: a tick where a find match or a highlight is, in the
  categories' colours. Hover to count them, click to go there.
- **Escape** still clears the search, then lets go of the highlight, then leaves the object.
- **Enter** on a message still selects the value of the highlight you stepped to, and opens the
  details otherwise.
- Nothing about **Show search box** or **Show overview ruler** under **Appearance**.

---

## Notes for the publishing pass — remove before publishing

- Shipped in ptarmiganlabs/chatbox.qs#61. Backfilled.
- **This is the one draft in this batch that describes a behaviour change rather than an addition.**
  It deserves a callout on whatever page covers keyboard shortcuts. The 0.6.0 release notes carry it
  under ⚠ BREAKING CHANGES, from a commit made for the purpose; if the site keeps release notes, link
  this page from that entry.
- Ported from textview.qs, which made the same change first. Check whether its own documentation
  words it better before rewriting this.
