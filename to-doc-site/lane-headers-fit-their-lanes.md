# Lane headers fit their lanes in exports and in edit mode

_Requires Chatbox.qs 0.6.5 or later._

## What changed

With **Conversations side by side**, each lane has a header with the conversation's name and, on the
right, how many messages it has. Where a click on a header selects nothing, the header was wider than
its lane. Each count then ran into the next lane, so a header read as "500Thread 23", and the last
lane's count was cut off at the object's edge.

That happened wherever a lane header does not select its conversation:

- in an **image or PDF export**,
- while the sheet is in **edit mode**,
- when the conversation dimension is an **expression** rather than a field, and
- on the lane for messages without a conversation.

The headers now fit their lanes in all of these, with the same spacing as on a sheet where a click
selects.

## What it does not change

- What a lane header shows, and when a click on it selects.
- Headers that select. They already fitted.

---

## Notes for the publishing pass — remove before publishing

- Probably not a page of its own: a line in the release notes, or a sentence on the side-by-side page
  if it describes exports or edit mode.
- The gate says 0.6.5 because that was the open release pull request when this was written. Check
  which release ships it.
- Checked 2026-11-18 on the lab, sheet "chatbox.qs lanes & chips", with real PNG exports. Before the
  fix, object A (linked lanes) read "T9 | 3T8 | 4T7 | 3T6", with T6's count cut off, and object C
  (free lanes) read "500Thread 23", with the last count clipped to "50". With the fix, A reads
  "T9 3 | T8 4 | T7 3 | T6 4" and C shows "500" at the right of each of its four lanes.
- Publishing note: the Qlik Sense Printing Service kept drawing exports with an older copy of the
  extension for over half an hour after an upload, even for a fresh render at a new size. Restarting
  the service brought in the new build. Worth a line on the installation or troubleshooting page:
  after updating the extension, restart the Printing Service before judging an export.
