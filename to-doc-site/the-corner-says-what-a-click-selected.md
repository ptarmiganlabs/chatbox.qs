# The object says what a click on a keyword selected

_Requires Chatbox.qs 0.6.0 or later._

## What changed

A click on a highlighted keyword selects its value in the highlight field, and a click on a legend
chip selects its category in the category field. A click that failed has always said why, in the
corner of the object. A click that **worked** said nothing at all.

That was the wrong way round. The highlight field is often in no other object on the sheet, so the
only evidence that anything was selected was a chip in Qlik Sense's selection bar, far from where the
reader clicked. The corner now says what was selected and where, for example:

_Selected “reload” in HlKeyword_

## What it does not change

- **A Ctrl+click or Cmd+click says nothing.** It adds a value or removes one, and the object cannot
  tell which of the two happened — a notice that guessed would be worse than none. Clicking the only
  selected chip clears it, and says nothing for the same reason.
- The messages for a click that selected nothing are unchanged: _HlKeyword is locked_, _There is no
  value to select in HlKeyword_, _Qlik Sense did not select in HlKeyword; the field may be locked_,
  and _Could not select in HlKeyword_ followed by the engine's error code where there is one.
- **Keyword and chip clicks still select at once.** They do not wait behind Sense's confirm tick the
  way a lane header does. That tick belongs to the values in an object's own data, and the highlight
  field is not part of the object's data, so there is nothing for the tick to confirm.

---

## Notes for the publishing pass — remove before publishing

- Shipped in ptarmiganlabs/chatbox.qs#61. Backfilled.
- The last point answers a question a reader will ask — _why does this click select immediately when
  the lane header waits for the tick?_ It was investigated and is a limit of the host, not a choice.
  Keep it.
- Known inaccuracy, tracked in ptarmiganlabs/chatbox.qs#62: a keyword standing for several spellings
  names only the first in the notice, which may not be one that was selected. If that is fixed
  before publishing, nothing here needs to change; if not, do not promise the notice is exact.
