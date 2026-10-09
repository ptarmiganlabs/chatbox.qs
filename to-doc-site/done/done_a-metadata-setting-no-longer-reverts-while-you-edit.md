<!--
Published 2026-10-09 in ptarmiganlabs/chatbox.qs-docs#11, on /v0.6/troubleshooting/ ("A
setting reverts while you edit the sheet"), gated "Requires Chatbox.qs 0.6.3 or later":
68d8066 is first in chatbox-qs-v0.6.3. A pointer to it sits under Message metadata on
/v0.6/data-model/ (ptarmiganlabs/chatbox.qs-docs#8). As the notes below ask, the page promises no fix for a
reload loop: it says the conversation could re-read its data repeatedly while edited, and
no more.
-->

# A Message metadata setting no longer reverts while you edit the sheet

_Requires Chatbox.qs 0.6.3 or later._

## What changed

Chatbox.qs holds the expressions you enter under **Message metadata** in two places: the panel's own
settings, and attribute expressions on the Message ID dimension, which is where the Qlik engine can
evaluate them for each message. While a sheet is in edit mode the extension copies the first into the
second, and that copy is what makes a change you make take effect.

The copy used to run again on every redraw, and it could never conclude that it had nothing left to
do, so it saved the whole object each time. Two things followed from that:

- A value you typed into **Message metadata** — or anywhere else in the property panel — could be
  replaced by the value that was there a moment earlier, if your edit landed in the gap between the
  extension reading the object and writing it back. The further your browser is from the Qlik Sense
  server, the longer that gap.
- The conversation could re-read its data repeatedly while the sheet was open for editing.

The extension now recognises when the Message ID dimension already carries what the panel says, and
writes nothing at all. When it does write, it changes only that dimension's attribute expressions and
its sort order rather than saving the whole object, so no other setting can be overwritten by it.

## What it does not change

- What the **Message metadata** expressions do, how they are written, or that each one must aggregate
  — `Only([Field])`, not a bare field reference.
- That they take effect only while a sheet is being edited. Opening a sheet as a reader never writes
  to the object, and never did.
- The order messages appear in. **Timestamp (numeric)** still decides it, and a reader's session still
  sorts a conversation that was saved before that setting existed.
- Readers, exports and snapshots, none of which were ever affected.

---

## Notes for the publishing pass — remove before publishing

- PR #55. The gate is 0.6.3 because 0.6.2 was released on 2026-10-06 without this fix — it is the
  next release this can land in, not a guess. Confirm against the release pull request anyway if
  further releases go out before this is published.
- The symptom a reader is most likely to have hit is the reverted setting. Whether the repeated writes
  also closed into a **continuous** reload loop has never been watched in a Sense client — the
  repeated writes themselves are confirmed on the lab, the loop is not. Do not promise a fix for "the
  chart kept reloading" unless somebody confirms that first.
- The engine behaviour behind it is `docs/GOTCHAS.md` entry 57. Nothing in that entry belongs on the
  site.
