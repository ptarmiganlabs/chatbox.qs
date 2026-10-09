# A click on a message that Qlik Sense refuses says why

_Requires Chatbox.qs 0.6.0 or later._

## What changed

A click on a message selects through the object's own selection mode — the sender, the recipient,
the conversation or the message, whichever **Behaviour → Clicking a message** says — and you confirm
it with Sense's tick, as in any chart.

When Qlik Sense refused that selection, usually because the field is locked, the click used to look
as if it had missed: nothing was selected, the confirm bar stayed up with nothing behind it, and
nothing said why. It now says so in the corner of the object, naming the field — for a sender field
called `Author`:

_Qlik Sense did not select in Author; the field may be locked_

and the selection is cancelled, the confirm bar with it. When Qlik Sense refuses one value in a
selection it lets go of **every** value picked in that selection, so anything you had picked before
the refused click — other messages, lane headers — goes too. There is nothing left to confirm.

Where the dimension is an expression rather than a field, the message names the dimension instead.

## What it does not change

- What a click on a message selects, and the setting that decides it.
- A click that Qlik Sense accepts: it is confirmed or cancelled with Sense's own tick and cross, as
  before, and says nothing in the corner — the selection bar already shows it.

---

## Notes for the publishing pass — remove before publishing

- Not a 0.6.0 change in the sense of the others: a message click has always gone through Sense's
  selection mode. What is new in 0.6.0 is what happens when it is refused. Gate it on 0.6.0 only if
  it ships in that release; check `gh release list` and the release PR first.
- Belongs beside `selecting-a-conversation-from-its-lane-header.md`, which describes the same
  refusal for a lane header. Publishing them together keeps the two explanations identical.
