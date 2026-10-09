# Copying one message

_Requires Chatbox.qs 0.6.0 or later._

## What changed

Until now the only way to copy out of the object was all of it: right-click, **Copy conversation as
text** or **Copy conversation as JSON**. A single message meant selecting its text with the mouse,
which Qlik Sense makes harder than it should be.

Each message now has a **copy button** in its bubble's upper corner. It appears while the pointer is
over the message, or while the keyboard is on it, and copies two lines:

```text
Ada → Bob, Carol · 2026-09-30 10:32
The reload failed again — same error as yesterday.
```

The first line is the sender, every recipient and the time; the second is the message as it was
written. They are the same two lines a whole-conversation copy gives that message, so a message copied
alone reads like one copied among the rest. The corner says _Copied the message_.

**Appearance → Show copy button on messages** takes the button away. It is on by default.

## What it does not change

- Clicking the copy button is never a click on the message: it does not select the sender, the
  conversation, or anything else.
- The right-click menu still copies the whole conversation, in both formats.
- Selecting the message text with the mouse still works and still copies only what was selected.
- Tabbing past the conversation costs the same however many messages it holds. The copy button is
  reachable from the keyboard on the message the focus is on, not on every message.

## Where copying is refused

Some browsers refuse clipboard access to a page served over plain HTTP, which a client-managed Qlik
Sense site sometimes is. The object then falls back to the browser's older copy command, and where
that is refused too the corner says _The browser did not allow copying to the clipboard_.

There is no copy button in an image or PDF export, which has no clipboard to copy to.

---

## Notes for the publishing pass — remove before publishing

- Shipped in ptarmiganlabs/chatbox.qs#61. Backfilled.
- The example's exact first-line format — separator, date, time — follows the transcript copy, which
  itself follows the object's timestamp settings. Copy a real message from the scratch app and paste
  what comes back rather than trusting this example.
- Because the bubble keeps room for the button whether it is drawn or not, messages are about ten
  pixels wider with the button on. Not worth a reader's attention unless somebody asks why turning
  it off makes bubbles narrower.
