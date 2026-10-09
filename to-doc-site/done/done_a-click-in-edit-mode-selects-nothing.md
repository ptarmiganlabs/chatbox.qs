# A click selects nothing while the sheet is being edited

_Requires Chatbox.qs 0.6.2 or later. Earlier versions selected on a click in edit mode._

## What changed

A click on a message selects — the sender, the recipient, the conversation or the message, whichever
**Behaviour → Clicking a message** says. Until this release that also happened while the sheet was
being edited, where a click on a native Sense chart only picks the object for editing: a developer
arranging a sheet could find an author selected without meaning to.

A click on a message now selects nothing:

- while the sheet is in **edit mode**,
- in an **image or PDF export**, and
- while Qlik Sense holds the object **inactive**.

The message then shows no pointer, and neither does its avatar, so nothing on screen offers a click
that would do nothing. A click on a highlighted keyword, a legend chip or a lane header already
behaved this way; all four now follow one rule.

## What it does not change

- **Reading a message is still possible.** **Behaviour → Clicking a message → Opens the details**
  still opens them in edit mode, and so does the **Details** link: neither selects anything.
- A click in analysis mode selects exactly as before.
- A message whose click selects nothing in analysis mode either — a sender with no value, say — no
  longer shows a pointer just because it has a **Details** link.

---

## Notes for the publishing pass — remove before publishing

- ptarmiganlabs/chatbox.qs#39, written in September and rebased onto 0.6.1 in October. The version
  gate assumes it ships in 0.6.2; check the release PR's title and `gh release list` before
  publishing.
- Belongs on the page about clicking a message, beside `a-refused-click-on-a-message-says-why.md`
  and the avatar draft.
