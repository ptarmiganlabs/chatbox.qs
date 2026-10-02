# Chatbox.qs

Render chat-style conversations from the Qlik Sense data model — message bubbles for two parties
talking back and forth, extending to any number of participants.

Part of the [.qs Library](https://github.com/ptarmiganlabs) from Ptarmigan Labs.

## What it does

- Message bubbles with per-participant colour, avatars and author grouping
- Rich per-message metadata — timestamps, badges, accent colours, avatars — carried by
  attribute expressions, which cost nothing against the engine's page budget
- Virtualized rendering, so a long transcript stays responsive
- Click-to-select on a participant or a message, honouring Sense selection state
- **Conversations side by side**, a lane per thread, scrolling linked in time or freely
- **Message kinds as chips** above the text
- **Highlights keywords** — the values of a field — wherever they occur in the messages, coloured by
  category, with a legend, an overview ruler and click-to-select
- **Search** within the conversation shown, stepping from match to match
- **Copy the conversation** as a readable transcript or as JSON, from the object's context menu
- Message text can be selected and copied with the mouse
- Detects the one data-model mistake that silently corrupts a chat view: a non-unique message id

## Data contract

The extension needs **one hypercube row per message**. A straight hypercube emits one row per
distinct combination of dimension values, so the message id **must be unique** — otherwise separate
messages merge into a single bubble. The extension detects that and warns rather than showing you a
quietly wrong conversation.

Choose a **conversation model** under _Conversation_ in the property panel **before adding
dimensions** — it decides which role each new dimension gets. Switching later never changes the role
of a dimension that is already there.

### Participants (default)

One dimension holds every speaker. Use it for group chats, or any conversation where who a message
went to does not matter.

| Slot        | Role                  | Notes                                                                              |
| ----------- | --------------------- | ---------------------------------------------------------------------------------- |
| Dimension 1 | Message ID            | Must be unique per message                                                         |
| Dimension 2 | Participant           | The speaker. Selections act on this                                                |
| Dimension 3 | Conversation / thread | Optional                                                                           |
| Dimension 4 | To                    | Optional — adds recipients to the bubbles                                          |
| Measure 1   | Message text          | `Only([MsgText])` — a measure, so long bodies never become selectable field values |
| Measure 2   | Integrity probe       | `Count([MsgId])` — detects merged bubbles                                          |
| Measure 3+  | KPIs                  | Optional                                                                           |

### From → To

A sender and a recipient dimension, for one-to-one conversations — an agent's chats, a DM export.

| Slot        | Role                  | Notes                                                                          |
| ----------- | --------------------- | ------------------------------------------------------------------------------ |
| Dimension 1 | Message ID            | Must be unique per message                                                     |
| Dimension 2 | From                  | The sender. Selections act on this                                             |
| Dimension 3 | To                    | The recipient, one per row                                                     |
| Dimension 4 | Conversation / thread | Optional                                                                       |
| Measure 1   | Message text          | `Only([MsgText])`                                                              |
| Measure 2   | Integrity probe       | Count a field only the messages table has, e.g. `Count([MsgText])` — see below |
| Measure 3+  | KPIs                  | Optional                                                                       |

- **One recipient per row.** A message to several people arrives as one row per recipient and is
  shown as one bubble listing them all. Store recipients one per row — split a stored list with
  `SubField()` in the load script.
- **Spell each person identically** in From and To. People are matched by exact, case-sensitive text.
- **Keep _Include null values_ on for To.** Unticking it silently drops every message without a
  recipient, and nothing downstream can detect that.
- **Maximum messages counts rows**, so a message to 20 people uses 20 of the budget (see
  [Maximum messages](#maximum-messages)). Data export likewise has one row per recipient.
- **Why not `Count([MsgId])` for the probe:** a From → To model usually links messages to a
  recipients table by that id, and counting a key field counts the linked table's rows — every group
  message would be reported as merged.

### Maximum messages

**Behaviour → Maximum messages** (default 5,000) caps the rows read. When the cube has more, which rows
are kept follows what is shown first:

- **Message order** _Oldest first_ keeps the **oldest** rows, where the conversation starts.
- _Newest first_ keeps the **newest**, and so do **conversations side by side**, in either order.

A banner says which, e.g. **Showing the newest 5000 of 9000 messages. Filter to see the rest.** Where the
limit falls part-way through a message's rows — one per recipient — its details say some recipients may
be missing.

A table linked to a dimension — people, threads — adds a row for each of its values that has no message,
and those rows come last in the cube. When the newest rows are read, they are found and left out first,
so they never take the place of a message. Oldest first reads them only once every message row fits.

## Two-sided layout

With **Layout** set to _Two-sided_, every conversation — a thread, or a From → To pair — is resolved
on its own:

- **Own participant** goes right in every conversation they are part of, however many people are in
  it. An expression such as `=OSUser()` works.
- Otherwise, in a two-person conversation the person with **more conversations** goes right, so an
  agent or an inbox owner stays on one side throughout. On a tie, whoever wrote last goes right — a
  single two-person chat looks exactly as it always has.
- A group message goes right only when its sender is on the right in each of its pairs. Three or more
  people with no Own participant among them stay left.
- The **Own message (1/0)** metadata expression outranks all of this: 1 or true puts a message on the
  right, 0 or false on the left, and null leaves it to these rules. `Only([Direction]) = 'outbound'`
  works as it reads.

Automatic sides are worked out from the messages currently loaded, so narrowing a selection to one
conversation can move them. For sides that never move, set Own participant or the Own message
expression.

## Conversations side by side

Switch on **Show conversations side by side** under **Conversation** to show several conversations next to
each other: a lane per value of the _Conversation / thread_ dimension, each headed by its name and how
many messages it has.

- **Which conversations:** the ones with the latest activity — the latest timestamp, or where there is
  none, the latest place in the cube — most recent on the left. **Most conversations side by side** (1–10,
  default 4) caps them, and a narrow object fits fewer, each lane at least 220 pixels wide. When some are
  not shown, a line above the lanes says so, e.g. **4 of 12 conversations**; select conversations to
  choose which.
- **Linked scrolling** (the default) lines the lanes up in time, with one scrollbar for all of them.
  Messages are laid out in rows: a row holds at most one message per lane, everything in a row is later
  than everything above it, a row never crosses a day, and messages side by side were sent within **Group
  messages within** (Appearance, default 2 minutes) of each other — after a longer pause, a message
  starts a row of its own, below. A quiet lane shows gaps while another talks.
- **Free scrolling** gives each lane its own list and scrollbar, packed without gaps, and each keeps its
  place when a selection changes the others.
- Messages without a thread share a **(no conversation)** lane.
- **A click on a lane's header selects that conversation**, through the object's own selection mode:
  pick one header, then another, then confirm or cancel them together, exactly as a filter pane works.
  A header you have picked is drawn in green, and a second click on it takes it back. The lanes stay
  as they were until you confirm, so there is always something left to pick. The **(no conversation)**
  lane has no value behind it and is not clickable.
- **When there are more conversations than fit**, the bar steps through them: **◂ 1–4 of 12 ▸**, a
  windowful at a time, down the same ranking. A selection that leaves fewer conversations pulls the
  window back on its own; otherwise it stays where you put it.
- Needs a _Conversation / thread_ dimension; without one, a banner says so and the conversation shows as
  one.

Everything else works across the lanes. Two-sided layout sides each lane's conversation on its own.
Search and the step keys go through the matches in time order with linked scrolling, and lane by lane
with free scrolling, where each lane has an overview ruler of its own. **↑** and **↓** move within a lane,
**←** and **→** to the next one. Automatic details open as an overlay, not a side pane that would squeeze
every lane, and automatic **Density** follows a lane's width. An image or PDF export shows the lanes the
reader saw.

With lanes, the newest rows are read, up to **Maximum messages**, so a limit that cuts the rows short
leaves out older conversations, not the latest. The conversations are then counted among the rows read,
and the line above the lanes always says so, e.g.
**4 of 12 conversations among the newest 5,000 of 9,000 rows**, or
**3 conversations among the newest 5,000 of 9,000 rows** when every conversation read has a lane — an
older one that was not read may be missing a lane.

## Whole conversations

Select `Author = Ada` and Qlik answers the question it was asked: the lines Ada wrote. The question
the reader usually meant is _which chats is Ada in_ — and for that, **Show whole conversations** under
**Conversation** reads the exchange back.

- A conversation is in scope when **any** of its messages survives the selection. Inside those
  conversations the selections on **Participant**, **From** and **To** stop narrowing, so the replies
  Ada answered and the answers she got come back with her own messages.
- **The highlight field and the category field stop narrowing too.** A keyword picks out which
  conversations are worth reading, not which lines of them: select the category _ops_ and you get the
  chats where ops came up, whole, with the ops keywords marked — not the four lines that said so.
- **Every other selection still narrows.** Pick a date as well and you see that day's messages of
  Ada's chats, not the whole history.
- The messages that match the selection are drawn as they always are; the rest are dimmed, because
  they are there to give the others their context. The bar says which is which, e.g. **24 messages in
  3 conversations · 8 match the selection**.
- A message belonging to no conversation is governed by the people rule alone: there is no
  conversation of its own for it to be in scope of.
- The button in the bar flips it for one reader, for as long as the object is open; the setting is
  what everyone else starts with, and a change to it drops the reader's own choice.

**It needs the people and conversation dimensions to be fields**, not expressions: freeing a field
from a selection means naming it. Where one of them is an expression the button is disabled and says
so, rather than widening some conversations and not others.

Under the hood the object reads a **copy of its cube in an empty session alternate state** — the only way to
re-read an expression as it is written, since the message body is your measure and nothing can be
injected into it. The object's own cube is untouched and stays in the default state, so selections
behave exactly as they always have. Nothing is written to the app: the state and the copy both live
only in your session, the state never appears among the app's alternate states, it never shows in the
selection bar, and nothing is ever selected in it. An image or PDF export is drawn without an engine,
so it shows the strict conversation.

A widened conversation holds more messages than a narrow one, so **Maximum messages** is reached
sooner; the banner says when it was.

**What it costs.** The widened cube is bounded by an expression over the message id, so the engine
weighs every message in the app, not only the ones **Maximum messages** reads. On a 12,000-message
app that is under a tenth of a second; it grows with the table, so on a very large one expect the
first draw after a selection to take noticeably longer than the strict view. With **nothing**
selected the object does not widen at all — there is nothing to free, so the widened cube would hold
exactly what the strict one does — which is also the moment the conversation is at its largest.

## Clicking a message

Set under **Behaviour → Clicking a message**:

- **Selects the participant (sender)** — the default.
- **Selects the recipient** — who the clicked message went to (From → To).
- **Selects the conversation** — the message's thread when it has one. Without a thread, in From →
  To, it selects everyone in the exchange in both From and To, so the view narrows to it with both
  sides kept. A message with no recipient belongs to no exchange, so there it is not offered.
- **Selects the message**, **Opens the details** or **Does nothing**.

A single value toggles, as a click in Sense always has. A set of values replaces that field's
selection, because toggling a set flips each value on its own.

Per-message metadata is configured under **Message metadata** in the property panel. Each expression
must aggregate — `Only([Field])`, not a bare field reference. A leading `=`, which the expression editor
adds, makes no difference.

### Timestamps and days

**Timestamp (numeric)**, e.g. `Num(Min([SentAt]))`, places messages in time: which of a sender's
messages share a header, where the **Date separators** (Appearance) start a new day, and which messages
share a row side by side. It also sets their order: the Message ID is sorted by the timestamp, and by the
id only where two messages share a timestamp, so ids need not rise over time. Without it, messages follow
the Message ID in numeric order. **Timestamp (display)**, e.g. `Only(Time([SentAt]))`, is the time shown
with each message.

- The sort is saved with the object while the sheet is edited. Until then, and in an app nobody can edit,
  each reader's session applies it without saving, so a new version sorts an existing chat at once.

- A Qlik timestamp has no time zone, so a message stays under the date the data holds wherever the
  reader is: a message at 23:30 on 8 September is under 8 September in Stockholm and in New York alike,
  as the time shown with it says. A copied transcript's date lines are the same days.
- **Today** and **Yesterday** are the reader's own, by the reader's clock. An image or PDF export, and a
  snapshot in a story, keep them as they were when it was taken.
- A numeric timestamp in Unix time, seconds or milliseconds since 1970, is taken as a real moment in time
  instead, and dated by the reader's clock.

### Message kinds as chips

Switch on **Show kinds as chips** under **Message kind** to show a message's kinds as chips above its
text — tags, labels, a ticket's categories.

- A message can have several kinds. `Only()` returns nothing for a message with more than one, so join
  them in the expression: `Concat(DISTINCT [MsgKind], ',')`.
- **Kinds are separated by** says what to split on: a comma, a semicolon, a vertical bar, or nothing, to
  keep the whole text as one kind. A comma also splits a value such as `1,000`. Values are trimmed, and a
  kind that repeats is shown once.
- **Most chips per message** (1–20, default 3) caps the chips on a bubble; the rest fold into one **+N**
  chip whose tooltip names them. At most 100 kinds are kept per message.
- A message made of several rows — one per recipient, say — shows the kinds of all of them.
- The details list every kind. Chips are not searched, and a click on one is a click on the message.

## Highlighting keywords

The values of a field — keywords, product codes, the e-mail addresses and phone numbers a text-mining
step found — can be highlighted wherever they occur in the messages, and coloured by the category
another field puts them in. It works the same way as in
[Textview.qs](https://github.com/ptarmiganlabs/textview.qs).

Set under **Highlights**:

- **Highlight field** lists the app's fields; **…or type a field name** takes a hidden field, or any
  field when the list cannot be read. `match` and `[match]` both work.
- **Which values:** the values selected in the field, as long as the other selections leave them
  possible. With nothing selected there, the values the other selections leave possible — so picking a
  category and a conversation lights that category's values up. **Highlight possible values** turns that
  second rule off. The field does not have to be associated with the messages: a data island works.

| Setting                            | Default | What it does                                                                                |
| ---------------------------------- | ------- | ------------------------------------------------------------------------------------------- |
| **Highlight possible values**      | On      | With nothing selected in the field, highlight the values that are possible.                 |
| **Most values to highlight**       | 1000    | From 1 to 10,000. When there are more, the first in sort order count.                       |
| **Select by clicking a highlight** | On      | A click on a highlight selects its value instead of doing what a click on the message does. |
| **Match case**                     | Off     | On: "Istanbul" no longer highlights "ISTANBUL".                                             |
| **Whole values only**              | On      | Off: a value is highlighted inside longer words too.                                        |
| **Flexible whitespace**            | On      | Off: spaces and line breaks must match exactly.                                             |
| **Show highlight summary**         | On      | The line above the conversation, e.g. "3 selected values · 12 highlights in 5 messages".    |

Values are matched in the text a message shows: a markdown message's rendered text, where a value can
run across bold, italic, links and code, but never from one paragraph, list item or table cell into
the next.

### Categories and colours

Set under **Categories**, which appears once a highlight field is set:

- **Category field** groups the values. A value without a category is highlighted in grey and counted
  under **No category**; a value in several categories is tinted in the first and underlined in all.
  A category field in a data island gives every value every category.
- **Colour expression** is evaluated for each category and returns a colour — `RGB(68, 119, 170)`,
  `ARGB()`, `HSL()`, `Color(3)`, or text such as `'#4477aa'` or `'steelblue'`. Type it as plain text; a
  leading `=` is optional. Without one, categories take the theme's colours by their element number,
  so a category keeps its colour whatever is selected — and can share a colour with an author.
- **Show legend** lists the categories with how many highlights each has across the conversation;
  hovering says in how many messages. **Show category labels** puts each highlight in a box with its
  category names after it, for readers who cannot rely on colour.

### Clicking highlights and chips

- A click on a highlight selects its value in the highlight field — every spelling it stands for — and
  a click on a legend chip selects its category. Ctrl+click or Cmd+click adds or removes; clicking the
  only selected chip clears it. These select directly, like a filter pane: a selection pending in the
  object's own selection mode is confirmed first.
- A highlight inside a link leaves the click to the link.
- Nothing is selected in edit mode, in an image or PDF export, or while **Select by clicking a
  highlight** is off. A click that selects nothing — a locked field, an engine error — says why in the
  corner.

### Messages

Warnings and errors are banners above the conversation, whatever the switches say: **The highlight
field X is not in the data model**, **The highlights could not be calculated: Qlik engine error N**,
**N values selected in X, but excluded by other selections**, **The first 1,000 of 20,017 selected
values**, **… their categories filled 20,000 rows**, **the search stopped early**, and the category and
colour expression problems. Information — the counts, **Select values in X to highlight them**, **No
values of X are possible with the current selections** — is the summary line.

### In the data model

- A keyword table linked to the messages by Message ID makes the id a key field: count a field only the
  messages table has in the integrity probe, such as `Count([MsgText])` (see
  [GOTCHAS 11](docs/GOTCHAS.md)).
- Load number-like keywords with `Text()`: a field loaded without it keeps one spelling for
  `0701234567` and `701234567`, and only that spelling is highlighted.
- At most 20,000 value and category rows are read; the summary says when that leaves values out.

## Searching messages

A search box at the top of the object finds what is typed in the conversation shown, independently of
Sense's search and of the highlights. It looks in the message text — a markdown message's rendered
text — and in the names in each message's header line, where the header is shown: a sender's following
messages share one header, and recipients folded into "and N more" are not searched. It ignores case,
treats any run of spaces and line breaks alike, and finds text inside longer words. Kind chips are not
searched. Nothing is selected.

- Matches are marked in orange; the counter says **3 of 12**, **12 matches** or **No matches**.
- Typing is searched after a short pause, and the first match from where you are reading becomes
  current. The query stays when a selection changes the conversation.
- **Show search box** under **Appearance** hides it.

## The bar above the conversation

The controls sit in groups, each a tinted pill, so one is never mistaken for another:

- **The find box** — what is typed, how many matches there are, and **▲ ▼** to step them.
- **Keywords** — a swatch drawn as this conversation's highlights are drawn, how many there are, and
  **◂ ▸** to step them. It appears once a highlight field is set.
- **Conversations** — **◂ 1–4 of 12 ▸**, with conversations side by side and more of them than fit.
- **Text size**, and whatever else the view offers.

On a narrow object the groups move below the highlight summary rather than squeezing it.

### Text size

**Text size** sets how large the conversation is drawn: the message bodies, the names, the times, the
badges and the kind chips. The bar keeps its own size, so the controls never move under the pointer as
you try sizes, and **Density** goes on deciding spacing, padding and avatars.

- **Follow density** is the default and is what the object has always done: 13, 12 or 11 px as the
  density resolves.
- **Text size** under **Appearance** sets what a reader starts with; the control in the bar is their
  own, for as long as the object is open, and gives way the moment the setting itself changes.
- **Show text size control** under **Appearance** takes it out of the bar.

## Stepping and the overview ruler

The find box and the keywords are stepped separately, each keeping its own place and its own counter.
The find box's buttons, F3 and Ctrl+G go through the search matches; the keyword buttons and Alt with
an arrow go through the highlights. Steps wrap around at either end, and the one you stepped to last is
the one outlined.

The **overview ruler** beside the conversation shows where the matches or highlights are, a tick per
place, in the categories' colours; hover to count them, click to go there. It appears only while there
are some, so an object with no highlight field and nothing typed never shows one, whatever **Show
overview ruler** under **Appearance** says.

| Keys                                                                | What they do                                                           |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **Ctrl+F** (**Cmd+F**)                                              | Goes to the search box, from inside the object.                        |
| **Enter** / **Shift+Enter** in the search box                       | The next or the previous match.                                        |
| **F3** / **Shift+F3**, **Ctrl+G** / **Ctrl+Shift+G** (Cmd on a Mac) | The next or the previous search match.                                 |
| **Alt+↓** / **Alt+↑**                                               | The next or the previous highlight.                                    |
| **Enter** on a message                                              | Selects the value of the highlight stepped to; otherwise, details.     |
| **←** / **→** on a message, with conversations side by side         | The neighbouring lane's message: in the same row, or where it is read. |
| **Escape**                                                          | Clears the search, lets go of the highlight, then leaves the object.   |

Before 0.6.0 one pair of buttons stepped both, and F3 meant the search matches while something was
typed and the highlights otherwise — one key with two meanings, depending on a box you may not have
been looking at. F3 and Ctrl+G now mean the find box and nothing else.

## Copying a conversation

Right-click the object for **Copy conversation as text** or **Copy conversation as JSON**. Both copy the
messages the object shows under the current selections, in the order shown.

**One message on its own** is copied from the button that appears on it under the pointer, or under the
keyboard. It copies the two lines a whole transcript gives that message — the sender, every recipient
and the time, then the message as it was written — so a message copied alone reads like a message
copied among the rest. **Show copy button on messages** under **Appearance** takes it away, and an
image or PDF export never has it.

- **Text** is a transcript: the date (YYYY-MM-DD) where a new day starts, the day its separator shows,
  then for each message a line with the sender, every recipient and the time as the object shows it,
  then the message as it was written.
- With **conversations side by side**, both copy the conversations shown one after another, each under
  a line naming it, rather than interleaved as linked lanes show them.
- **JSON** starts with a summary of what was copied, under `conversation`: the number of `messages`; the
  `rows` the conversation holds and how many were read (`rowsRead`); whether **Maximum messages** cut them
  short (`truncated`) and whether it kept the `"oldest"` or the `"newest"` (`truncatedTo`, null when
  nothing was cut); the `order`; and, side by side, how many `conversations` are shown of how many.
- It then holds each message's id, sender, recipients, thread, time, kind, badge, format, body and KPIs,
  and, while highlighting is on, its highlights with their values, categories and offsets — into the
  body, or into `plainText`, the text a markdown message shows — after a summary of the highlight field
  and the counts per category. Search matches are not included.
- A message's `time` is its **Timestamp (numeric)** in ISO 8601. A Qlik timestamp has no time zone, and
  neither has `time`, e.g. `"2026-09-08T23:30:00.000"`: the date and time the data holds, the same
  whoever copies it, a local time in whatever zone the data was recorded in. Only a timestamp in Unix
  time (see [Timestamps and days](#timestamps-and-days)) is a real moment, written in UTC with a `Z`,
  e.g. `"2026-09-08T21:30:00.000Z"`. `timeText` is the time as the object shows it.
- `schemaVersion` is 2. Version 1, in 0.4.0, wrote a `Z` on every `time`, UTC or not. `exportedAt`, when
  the copy was made, is always UTC.

Message text can also be selected and copied with the mouse; a drag that selects text does not count
as a click on the message.

## Getting started

1. Download `chatbox-qs.zip` from the releases page.
2. Import it in the QMC (Extensions) or the Qlik Cloud management console.
3. Drop **Chatbox.qs** on a sheet and add the dimensions and measures above, in order.

## Development

```bash
npm install          # Node >= 24.15.0
npm test             # vitest
npm run lint
npm run pack:prod    # -> chatbox-qs.zip
```

`npm start` runs `nebula serve`, but note it does **not** render the property panel — `nebula serve`
ignores `ext.definition` entirely. Property-panel changes must be built and uploaded to a real Sense
server to be seen, which is why the panel's shape is unit-tested.

See [docs/GOTCHAS.md](docs/GOTCHAS.md) for the engine and toolchain traps this extension has already
hit, each of which produced silently wrong output rather than an error.

## Requirements

- Qlik Sense Enterprise on Windows (primary target) or Qlik Cloud
- Node 24.15.0+ to build

## Licence

MIT — see [LICENSE](LICENSE).
