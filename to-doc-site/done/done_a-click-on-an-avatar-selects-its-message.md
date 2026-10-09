# A click on a message's avatar does what a click on the message does

_Requires Chatbox.qs 0.6.0 or later._

## What changed

The round picture or initials beside a message used to do nothing when clicked. A reader pointing at
the face next to a message is pointing at the message, so the avatar now does exactly what a click on
the bubble beside it does — whatever **Behaviour → Clicking a message** is set to: select the sender,
the recipient, the conversation or the message, or open its details.

## What it does not change

- **Where a click on the message does nothing, a click on the avatar does nothing either.**
- **The avatar adds no tab stop.** The message beside it already offers the same action to the
  keyboard, and a second stop on every message is exactly what keeping the conversation to one tab
  stop exists to prevent.
- Nothing is selected in edit mode or in an image or PDF export, as before.

---

## Notes for the publishing pass — remove before publishing

- Shipped in ptarmiganlabs/chatbox.qs#61. Backfilled.
- Small enough to be one sentence on the page that documents **Clicking a message** rather than a
  page of its own.
