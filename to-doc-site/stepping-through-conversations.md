# Reaching conversations that do not fit on screen

_Requires Chatbox.qs 0.6.0 or later._

## What changed

Lanes do not scroll sideways. The object ranks conversations by their latest activity, keeps as many
as **Most conversations side by side** and the object's width allow, and used to leave the rest
unreachable — a line above the lanes said **4 of 12 conversations** and that was all you could do
about it without making a selection.

The bar now has a group that steps through them: **◂ 1–4 of 12 ▸**, a windowful at a time, down the
same ranking. It appears only when there are more conversations than fit.

The window stays where you put it. A selection that leaves fewer conversations pulls it back far
enough to show something, but a reader who stepped back to older conversations is not returned to the
newest ones every time the data changes under them.

## What it does not change

- **Which** conversations exist, and their order: latest activity first, newest on the left.
- **Most conversations side by side** (1–10, default 4) and the 220-pixel minimum lane width still
  decide how many are on screen at once.
- The line above the lanes still says how many there are in total, and still says so in terms of the
  rows read when `Maximum messages` cut them short.
- An image or PDF export shows the lanes the reader had on screen, not the whole ranking.

---

## Notes for the publishing pass — remove before publishing

- Shipped in ptarmiganlabs/chatbox.qs#61. Backfilled.
- Proposed page: the lanes page, next to the lane-header section from
  `selecting-a-conversation-from-its-lane-header.md`. Those two are the same reader's next two
  questions and should be adjacent.
