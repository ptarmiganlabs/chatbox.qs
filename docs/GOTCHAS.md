# Gotchas

Traps this extension has already hit. Every one of them produced **silently wrong output rather than
an error**, which is what makes them expensive: the build passes, the package uploads, and the defect
only appears inside a running Sense client.

Each has a regression test. If you are tempted to "simplify" one of these, read the test first.

## 1. `qIsNull` is set on string-valued measures

A measure returning text — `Only([MsgText])`, which is how message bodies arrive — has a null
_numeric_ value, so the engine sets `qIsNull` on a cell whose `qText` is perfectly good.

Guarding on `qIsNull` blanked every message body while dimensions rendered fine.

**Rule:** read `qText` unconditionally. Qlik's own `sn-table` and `sn-pivot-table` contain **zero**
references to `qIsNull` in their entire source. `num()` still guards it, because a null number really
is null.

_See `src/qix/read-cell.js`._

## 2. Qlik timestamps are day serials, not epoch milliseconds

`Num(Min([SentAt]))` returns **46273.34** — days since 1899-12-30 — not `1788855124000`.

Comparing serial deltas (~0.0009) against a millisecond threshold (120000) meant time-based message
grouping could never fire. Nothing errored; the feature was simply inert.

**Rule:** everything time-related goes through `qlikTimeToEpochMs()`. It passes values above 1e11
through untouched, since no real day serial reaches that, and reads a value past the last Qlik date as
Unix seconds (entry 36). What it returns for a serial is a wall-clock time, not an instant (entry 32).

_See `src/chat/sanitize.js`._

## 3. The engine's `'-'` null sentinel is a valid relative URL

The engine returns `'-'` for a null value. `new URL('-', base)` resolves happily to `https://host/-`
with an allowed scheme, so a null avatar expression reached the DOM as `<img src="-">` — which
requested the hub page and permanently suppressed the initials fallback for that participant.

**Rule:** `'-'` is checked explicitly in `safeUrl()` and `attrText()`, not just empty strings.

## 4. Babel and Rollup can disagree about the build mode

`@babel/preset-react` derives its `development` flag from `BABEL_ENV || NODE_ENV`, defaulting to
`"development"` when neither is set. `@nebula.js/cli-build` defaults Rollup's mode to `"production"`.

Left alone, Babel emits `jsxDEV()` calls while Rollup bundles React's production dev-runtime stub,
where `jsxDEV` is `undefined`. The extension builds, packages and uploads cleanly, then throws
`jsxDEV is not a function` and renders nothing.

**Rule:** `NODE_ENV` is pinned to match `--mode` in both build scripts, and `scripts/post-build.mjs`
fails a production build if `jsxDEV` reaches the bundle.

## 5. A property-panel item materialises the path it binds to

Regardless of any `show` guard. An item bound to
`qHyperCubeDef.qDimensions.0.qAttributeExpressions.N.qExpression` **creates `qDimensions[0]`** when
the panel is built, and Sense renders that fieldless dimension as a red "Invalid dimension" the
instant the object is dropped on a sheet.

**Rule:** panel items bind to `chatbox.attrs.*`, and `src/qix/sync-attrs.js` reconciles them into the
cube once a real dimension exists. A unit test fails the build if any item binds to an absolute
`qHyperCubeDef.` path again.

## 6. A rejected panel section makes the WHOLE panel vanish

Silently, with nothing in the console. Splitting `uses: 'data'` into separate `uses: 'dimensions'`
and `uses: 'measures'` sections — documented classic-API syntax — produced no property panel at all.

**Rule:** `data` stays a single `{ uses: 'data' }` section, asserted by a test. Verify any new
`component` string against a shipped `sn-*` bundle before using it; nebula's own docs contain at
least two wrong ones (`button-group` should be `buttongroup`, and `theme.validateColor` does not
exist).

## 7. `nebula serve` does not render the property panel

It ignores `ext.definition` entirely and introspects raw properties by JavaScript type. Every panel
change needs a full `nebula sense` build and an upload to a real Sense server to be seen.

**Rule:** keep `src/ext/` a pure data structure and unit-test its shape — that is the only feedback
loop that costs less than a deploy.

## 8. Non-unique message ids merge messages silently

A straight hypercube emits one row per distinct combination of dimension values. Two messages
sharing a message id **and** an author collapse into one bubble with no warning. (Sharing only the id
is harmless — the author disambiguates the combination.)

**Rule:** the hidden `Count([MsgId])` integrity probe measure detects it and the extension renders a
warning banner. It is a data-model constraint the extension can detect but never fix.

## 9. The positional role fallback can hand one column to two roles

Roles bind by `cId`, with a positional fallback for columns that have none — an older object, or a
chart converted from another type, whose columns carry uids. The fallback used to look only at the
slot. Delete the Participant dimension and the thread column moves into its slot: it was bound as the
speaker **and** the thread, conversation ids rendered as names, and the not-configured state never
appeared.

**Rule:** bind by `cId` first, within the role's own axis. A positional slot may only supply a
column that no role has claimed and that carries no role `cId`. A column tagged for one role is never
reinterpreted as another.

_See `src/qix/column-map.js`._

## 10. One message can arrive as several rows, and the probe cannot see it

A straight hypercube emits one row per distinct combination of dimension values. Give a message a
dimension with several values for it — a recipient dimension on a group message, or a dimension no
role uses — and the message arrives once per value. `Count([MsgId])` is 1 on every one of those rows,
so the integrity probe stays quiet, and the bubble silently repeats.

**Rule:** rows sharing message-id element, author and thread collapse into one bubble, but only when
body and timestamp also agree — ids unique per chat but not globally would otherwise fold two
messages together and drop one. Never collapse a negative message-id element. Truncation compares
**rows** loaded with `qcy`, never bubbles. Views key on `message.key`, which stays unique when ids
repeat.

_See `src/chat/collapse.js`._

## 11. Counting a key field counts the linked table's rows

`Count([MsgId])` is the integrity probe, and it works while the message id lives in one table. Link
messages to a recipients table by that id and it becomes a key field — and counting a key field does
not count messages. On PTLAB, `Count(OrderID)` over a sales table linked to a three-rows-per-order
table returned **3000** against 1000 distinct orders, and 3 on every per-order row. The probe reported
every group message as merged.

**Rule:** the probe counts a field that exists only in the messages table, e.g. `Count([MsgText])`.
The From → To slot description says so.

## 12. Element numbers belong to a field, not to a person

`qElemNumber` is a value's index in its field's symbol table. Ada is element 0 in From and element 9
in To. Selecting her in the To field with her From element selects whoever holds element 0 there — no
error, just a different person.

**Rule:** people are matched across From and To by exact text, and every selection uses element
numbers read from the field being selected: participants carry From-field elements,
`conversation.recipientElems` carries To-field elements.

_See `src/chat/recipients.js` and `collectRecipientElems` in `src/chat/normalize.js`._

## 13. Null suppression off turns every silent linked value into a row

Null suppression is pinned off on every dimension, so that a message whose thread or recipient is
null still renders. The price: a value of a table linked to one of those dimensions that has **no**
message still becomes a row — a person nobody wrote to, a thread with nothing in it — with a null
message id, no text and a probe of 0. On PTLAB, a cube over 1000 orders returned 1035 rows; the extra
35 were exactly the employees with no orders. Each rendered as an empty bubble, and its person counted
as a participant, which silently switched two-sided layout off.

**Rule:** a row is dropped as a phantom only when its message-id element is negative **and** it has no
text **and** its probe is 0 or absent — a null id with text or a positive probe is a real, broken
message and is kept and reported. Phantoms still count as loaded rows, and are only reported when they
used up the row limit.

Null message ids sort **last** under every sort tried on Qlik Sense May 2026 — numeric and by expression,
ascending and descending — so the phantom rows are one block at the end of the cube. Reading the newest
rows (entry 31) read that block first: with as many phantom rows as the limit, an object showed no
message at all. When the newest rows are read and the cube has more rows than the limit, the block is
counted back from the last row first, over the message id, text and probe columns only, with the same
test (`phantomRowTest`), and the rows read end before it; skipped phantom rows are not counted as rows
left out.

_See `isPhantomRecord` in `src/chat/collapse.js`, `src/qix/conversation-rows.js`. Guard:
`test/unit/conversation-rows.test.js`, `test/unit/scale.test.js`._

## 14. One failed select resets the whole selection session

stardust's `selections.select()` calls `resetMadeSelections()` whenever a call returns `false`, which
undoes every selection made in the session, not just the one that failed. And `selectHyperCubeValues`
with toggle on flips each listed value separately: toggling `[Ada, Bob]` while Ada is already
selected leaves just Bob.

**Rule:** a click that selects in two fields runs its steps in order and stops at the first `false`,
so they succeed or fail together. A single value toggles; a set replaces. Never send an empty value
list — the engine reads it as every value.

_See `src/qix/selection.js`._

## Highlighting, search and copying

Entries 15 to 25 are traps met building [Textview.qs](https://github.com/ptarmiganlabs/textview.qs),
whose highlight and matching code this extension now shares; they apply here the same way. The rest
were met here.

## 15. A selection in an unassociated field leaves the object's layout untouched

A highlight field in a data island, or any field not associated with the messages, can change what
should be highlighted without changing anything the object's cube computes. Where the engine then sends
no change for the object, nebula does not render, and the highlights silently stay as they were.
Textview.qs met this. On Qlik Sense May 2026 a chatbox object did get a change for a selection in a data
island, so a check on that server does not show the trap.

**Rule:** a companion session object holds the highlight counts and values, and the object loads the
highlights again on the companion's `changed` event.
_Guard: `test/unit/companion.test.js`, `test/unit/highlight-loader.test.js`._

## 16. `GetSelectedCount` answers null for a field that is not in the data model

Not 0: an expression that reads null as "nothing selected" turns a misspelt field name into a quiet
"select values to highlight them", forever.

**Rule:** count with `Alt(GetSelectedCount(field, …), -1)` and report -1 as a missing field.
_Guard: `test/unit/companion.test.js`, `test/unit/highlight-source.test.js`._

## 17. A dimension on a field that is not in the data model is dropped from the cube

The engine leaves the column out: `qSize.qcx` shrinks, rows keep coming without it, and the dropped
dimension's info carries an error (7000). Taking the first error in any dimension as the cube's error
throws away values that are fine.

**Rule:** judge the value column by its own error, check the category field with
`Alt(GetSelectedCount(field, True()), -1)`, and never present a missing category column as values
without categories. _Guard: `test/unit/highlight-source.test.js`._

## 18. A syntax error in an attribute expression is silent

Every cell's attribute answers `{"qNum": "NaN"}` and nothing in the layout reports an error: exactly
what a sound colour expression that returns null for every category looks like.

**Rule:** check the colour expression with the Doc's `CheckExpression`, which reports syntax errors and
fields that are not in the data model. _Guard: `test/unit/expression-check.test.js`._

## 19. `qHypercubeCardinal` ignores selections

It looks like the number of distinct values in a dimension, but with 1,335 of 20,017 values possible
it still said 20,017. A cube with a row per value and category needs another way to count values.

**Rule:** count the possible values with `GetPossibleCount(field)` in the companion.
_Guard: `test/unit/companion.test.js`._

## 20. A category field in a data island multiplies the rows

A category field not associated with the highlight field pairs every value with every category: 20,017
values and 7 categories made 140,119 rows.

**Rule:** read at most 20,000 value and category rows, stop paging once one value past the limit is
seen (`isEnough` in `fetchAllRows`), never keep a value with only some of its categories, and say that
the categories filled the rows. _Guard: `test/unit/highlight-source.test.js`,
`test/unit/paging.test.js`._

## 21. A field selection is not part of the object's selection mode

`useSelections()` selects only in the object's own hypercube, and the highlight and category fields are
not in it. A click on a highlight or a chip selects in the field with `Field.LowLevelSelect`, which
applies at once, refuses a locked field (it answers false), and can read an empty element list as every
value.

**Rule:** select by element number in the object's state, never with an empty list, and say when the
engine refuses. A selection a click on a message left pending is confirmed first, as a click elsewhere
in Sense would; on engine error 6003 (another object holds the selection mode) the modal state is ended
the way stardust ends it and the selection is tried once more. _Guard:
`test/unit/field-selection.test.js`._

## 22. The engine's field list leaves out hidden fields

A field dropdown fed by the field list can never offer a hidden field, and the list can come back
unreadable for reasons outside the extension.

**Rule:** a typed field name is bound to the same property as the dropdown, and a typed name the list
does not show stays the visible choice. _Guard: `test/unit/ext-definition.test.js`,
`test/unit/highlight-section.test.js`._

## 23. `toLowerCase()` can change a string's length

`'İ'.toLowerCase()` is two UTF-16 units. Matching on a lowercased copy and cutting the original at its
offsets marked the wrong characters after every such letter.

**Rule:** fold case one code point at a time and keep any character whose lowercase form has another
length (`foldCase`). _Guard: `test/unit/match/fold.test.js`._

## 24. Qlik Sense switches text selection off everywhere

The client sets `user-select: none` on every element, so message text could not be selected or copied
with the mouse. Switching it back on makes a drag that selects text end in a click on the bubble.

**Rule:** bodies, detail quotes and names set `user-select: text` under the root, category labels are
generated content with `user-select: none`, and a click that ends a text selection or lands on a link
does nothing to the message. _Guard: `test/guards/selectable-text.test.js`,
`test/unit/click-route.test.js`._

## 25. A flex item beside a long list shrinks to nothing

The bar above the conversation is a flex item in a column whose list takes all the room: without
`flex: none` a long conversation squeezes the legend to a sliver.

**Rule:** `.bar` is `flex: none`, and the legend scrolls past a few lines instead of growing.
_Guard: `test/guards/selectable-text.test.js`._

## 26. A markdown body's text is not its source

`**New** York` renders as "New York"; offsets into the source do not fit the rendered text, and a
rehype plugin sees raw HTML as `raw` nodes, which react-markdown only turns into text after the plugins
run. Counting in one text and drawing in another would put marks — and the value a click on one
selects — in the wrong place.

**Rule:** one walker turns a rendered tree into text, both when the conversation is matched and inside
react-markdown when a body is drawn, parsing with the same processor; the plugin draws nothing when its
text differs. `unified`, `remark-parse` and `remark-rehype` are declared at react-markdown's majors.
_Guard: `test/component/markdown-highlights.test.jsx`, `test/unit/markdown-deps.test.js`._

## 27. Rendering Loading for a reload unmounted the conversation

Every selection changes the layout, and the object rendered its Loading state until the new rows
arrived. That replaced the conversation component, so everything it held went with it: the list jumped
back to its first message after every click, and an open detail closed. Anything cached in the
component would have been lost on every selection too.

**Rule:** while newer rows load, the conversation that was shown stays mounted, marked as reloading;
the highlighter, the finder and the search query live in `src/index.js`, not in the component.
_Guard: `test/unit/reload-view.test.js`, `test/component/chatlog-reload.test.jsx`._

## 28. The virtualizer cannot say where the reader is

Returning the reader to their message after a selection ran into react-virtuoso five times:

- It keeps its pixel offset when the data changes and reports whatever message now sits at the top,
  before an effect can read where the reader was. The first version read the key in an effect, and so
  returned to the wrong message.
- Its range counts the rows it draws beyond the view (`increaseViewportBy`), so the first message of the
  range is one the reader cannot see. When a selection removed that message there was nothing to return
  to, and the list kept a pixel offset past the end of the shorter list.
- With day separators it holds the day's header at the top of the view, over the row behind it; a
  message scrolled to the top sits below the header.
- It draws a longer list's height in an update of its own, after the commit that brought the messages,
  so a scroll to a message further down than the old list reached stopped at the old end.
- Its `followOutput` option counts a list short enough to fit as scrolled to the bottom, so clearing a
  selection followed the returning messages to the last one.

While Loading replaced the list none of this came into play, and in jsdom none of it can be seen: the
first two were found on Qlik Sense, the rest in headless Chrome over 12,000 messages.

**Rule:** the reader's place is read while rendering the new messages, from the rows on screen below any
held day header; the return goes to that message, or to the nearest one still shown, in a layout effect
and once more after the commit; the list does not follow new rows to the bottom. _Guard:
`test/component/chatlog-reload.test.jsx`._

## 29. An image or PDF export draws the object without the engine

Sense exports by drawing the object again from a copy of its layout, on a server where the model has no
data calls: a companion object cannot be created there.

**Rule:** a snapshot layout gets no highlights and no search box, rather than an engine call that
cannot succeed. _Guard: `test/unit/highlight/highlight-result.test.js`,
`test/component/chatlog-search.test.jsx`._

## 30. The Clipboard API is refused on plain-HTTP Sense

Client-managed Sense is often served over plain HTTP, and there `navigator.clipboard.writeText` is
refused, so a copy from the context menu would silently copy nothing.

**Rule:** fall back to `execCommand('copy')` from a focused, hidden textarea, and say when neither
worked. _Guard: `test/unit/copy-text.test.js`, `test/unit/copy-conversation.test.js`._

## 31. Reading rows from the first one keeps the oldest messages

The cube is sorted oldest first, and the rows were read from row 0 up to **Maximum messages**. _Newest
first_ reverses the messages read, so a cube over the limit showed its oldest messages, newest first, as
if they were the latest. Conversations side by side ranked lanes by latest activity among those old rows
only. The banner said "Showing 5000 of 9000 messages", which was true, and nothing said which 5000.

**Rule:** _Newest first_ and lanes read the last rows (`readsFromEnd`, `fromEnd` in `fetchAllRows`),
reusing the rows that came with the layout only where they reach into them, and the area keeps every row
number absolute. `normalize` tells where the limit cut from where the rows read start: the bubble at a
cut may be missing recipients, first as well as last, unless the row at the cut is a phantom; and the
banner and the line above the lanes say whether the oldest or the newest rows were kept. Null message ids
sort last, so the newest rows would take in every phantom row: they are left out first (entry 13). _Guard:
`test/unit/paging.test.js`, `test/unit/normalize.test.js`, `test/unit/message-limit.test.js`,
`test/unit/scale.test.js`._

## 32. A Qlik timestamp has no time zone, but a `Date` reads one

`Num(Min([SentAt]))` for 23:30 on 8 September is **46273.979** wherever the data was recorded, and
`qlikTimeToEpochMs` makes it the milliseconds of 23:30 on 8 September _as if it were UTC_. The day
separators read those milliseconds with the local getters, so each reader saw the day it was in their own
zone: in Stockholm the message went under 9 September, and in New York a message at 00:30 on 9 September
went under the 8th. The copied transcript's date lines did the same. In UTC, where CI runs, local and UTC
getters agree, so nothing failed.

**Yesterday** was wrong on its own too: it was the day of the instant 24 hours before now, which is still
today in the last hour of the day the clocks go back, and two days back in the first hour after they go
forward.

**Rule:** a timestamp from a day serial is a wall-clock time. Read it with the UTC getters, and write it
with an `Intl.DateTimeFormat` that names `timeZone: 'UTC'` — one made without a time zone writes in the
zone it was made in. `wallClockOf` in `src/chat/grouping.js` is the one place a message's timestamp
becomes a day, for the separators, the rows side by side and the transcript alike; a timestamp that came
as Unix time is a real instant, marked `tsInstant` by `normalize`, and becomes the reader's wall clock
there. Today and Yesterday are the reader's wall clock and one wall-clock day before it. An export
is drawn again on the server, on a clock and in a time zone of its own, so the day labels take the
reader's wall clock rather than an instant, and a snapshot records it (`today`). A test of dates runs in
several zones (`inTimeZone` in `test/helpers/time-zones.js`), whatever zone the machine is in. The
JSON's `time` writes a wall-clock time with no zone and only an instant with a `Z` (schema 2; schema 1
wrote a `Z` on both).
_Guard: `test/unit/time-zones.test.js`, `test/unit/grouping.test.js`, `test/unit/snapshot.test.js`,
`test/unit/conversation-export.test.js`, `test/guards/wall-clock-dates.test.js`._

## 33. A metadata value typed with `=` reaches the layout as its result

The metadata items accept an expression, so Sense stores a value typed with a leading `=` — or built in the
expression editor, which adds one — as `{ qStringExpression: { qExpr: 'Only(ThreadId)' } }`, and puts
what it gives **for the whole object** in the layout. On Qlik Sense May 2026, `=Only(ThreadId)` in
Badge text reached the layout as `'-'`. The sync read the layout and copied `'-'` into the cube, where it
gives nothing for any message: no badge anywhere, and no error.

**Rule:** the sync reads `chatbox.attrs` from the object properties, where the formula is still whole
(`formulaOf` in `src/qix/sync-attrs.js`), never from the layout. The engine takes an attribute expression
with or without a leading `=`. _Guard: `test/unit/sync-attrs.test.js`._

## 34. Clearing a panel field leaves an empty string behind

The sync never lets an empty panel wipe expressions set outside it, through the API or an import. It took
a bag of blanks for such a panel, but on Qlik Sense May 2026 clearing a field stores `''` and keeps the
key, so clearing the only field filled in left its expression in the cube, on every message.

A panel that was never typed into has no `chatbox.attrs` at all: not when its section opens, and not when
other settings are saved through the panel.

**Rule:** only a bag with no value in it, not even `''`, is a panel never filled in (`isBagUnset` in
`src/qix/sync-attrs.js`). A bag of blanks is a panel that was emptied, and its blanks are written.
_Guard: `test/unit/sync-attrs.test.js`._

## 35. Qlik's true is -1

A comparison such as `Only([Direction]) = 'outbound'` gives **-1** where it holds and 0 where it does not.
**Own message (1/0)** took only 1 as the right side, so every match was ignored while every 0 still
pinned its message left.

**Rule:** `ownMessageHint` in `src/chat/sanitize.js` reads 1 and -1 as the right side, 0 as the left and
anything else as no hint, before a message's rows are collapsed, so the rows agree whichever way they say
true. _Guard: `test/unit/sanitize.test.js`, `test/unit/normalize.test.js`._

## 36. Unix time in seconds is not a Qlik date

`qlikTimeToEpochMs` took any value below 1e11 for a day serial. Unix time in seconds, 1,788,855,124 for
8 September 2026, then lands millions of years out, past what a `Date` can hold: every day separator read
"NaN-NaN-NaN", and **Copy conversation as JSON** threw in `toISOString`.

**Rule:** Qlik dates end on 31 December 9999, day serial 2,958,465, so a larger value is Unix time:
seconds below 1e11, milliseconds from there (`isUnixTime`), and a real instant either way. A result no
`Date` can hold is no timestamp. _Guard: `test/unit/sanitize.test.js`, `test/unit/time-zones.test.js`,
`test/unit/conversation-export.test.js`._

## 37. Messages followed the Message ID, not the time

A straight cube lists rows in its sort order, and the conversation reads that order as time: Oldest first
from the first row, Newest first and lanes from the last. The Message ID was only ever sorted numerically,
which is time order only while ids rise with time. On a 0.4.0 server whose ids did not, Newest first showed
Feb 3, Feb 5, Feb 3 from the top, and "the newest 1,000" were only the highest ids. Test data numbered in
time order never shows it: on the lab, ChatBig's ids rise with its timestamps for all 12,000 rows.

**Rule:** with a timestamp expression on the message id, the message id sorts by it, earliest first, in one
criteria entry with the numeric sort, where the engine applies the expression first and the id only breaks
ties (checked on the engine). The engine sorts, so the message limit keeps the newest messages, not the
highest ids; a sort in the browser could only reorder rows the limit had already chosen. In edit mode
`syncAttributeExpressions` saves the sort. Elsewhere `createTimeOrder` in `src/qix/time-order.js` applies
it as a soft patch — session only, and allowed without edit rights, so a published app is sorted for every
reader — once per object, before any row is read, and never in a snapshot. _Guard:
`test/unit/time-order.test.js`, `test/unit/sync-attrs.test.js`._
