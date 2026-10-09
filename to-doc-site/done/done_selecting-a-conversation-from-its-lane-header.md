# Selecting a conversation by clicking its lane header

_Requires Chatbox.qs 0.6.0 or later._

## What changed

With **Show conversations side by side** on, each lane is headed by its conversation's name and
message count. Those headers were labels. They are now selection controls.

Clicking one selects that conversation in the field behind the _Conversation / thread_ dimension,
through the object's own selection mode — exactly as a filter pane works:

1. Click a header. It turns green, and the lanes stay as they were.
2. Click another, and another. Each one you have picked is green; clicking a green header again takes
   it back.
3. Confirm with the tick, or cancel with the cross, as you would for any Sense object.

The lanes deliberately do not change while you are choosing. If the board rearranged itself after the
first header, there would be nothing left to pick for the second.

## When Qlik Sense refuses the click

A header whose field is locked cannot be selected. The click then says so in the corner of the
object — for a thread field called `ThreadId`:

_Qlik Sense did not select in ThreadId; the field may be locked_

and the selection is cancelled, the confirm bar with it. Any header you had already picked goes grey
too: when Qlik Sense refuses one value in a selection, it lets go of every value picked in that
selection, so there would be nothing left to confirm. Where the thread dimension is an expression,
the message names the dimension instead of a field.

## What it does not change

- **The (no conversation) lane is not clickable.** It collects messages that have no thread value, so
  there is nothing behind it to select.
- Nothing about what the lanes show, how they are ranked, or either scrolling mode.
- A thread dimension built on an expression still works: the object addresses the column rather than
  a field name.
- Nothing is selected in edit mode, or in an image or PDF export.

---

## Notes for the publishing pass — remove before publishing

- Shipped in ptarmiganlabs/chatbox.qs#61. Backfilled.
- Publish after `whole-conversations.md`, which is where the two features meet: with the mode on, a
  conversation picked here comes back whole.
- Proposed page: the existing lanes page, as a new section rather than a page of its own.
- The refusal section was added before 0.6.0 was released, so it gates against 0.6.0 with the rest.
  If it is published against a later version, check whether 0.6.0 itself shipped with it.
