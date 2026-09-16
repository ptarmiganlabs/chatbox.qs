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
- **Maximum messages counts rows**, so a message to 20 people uses 20 of the budget. Data export
  likewise has one row per recipient.
- **Why not `Count([MsgId])` for the probe:** a From → To model usually links messages to a
  recipients table by that id, and counting a key field counts the linked table's rows — every group
  message would be reported as merged.

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
- The **Own message (1/0)** metadata expression outranks all of this.

Automatic sides are worked out from the messages currently loaded, so narrowing a selection to one
conversation can move them. For sides that never move, set Own participant or the Own message
expression.

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
must aggregate — `Only([Field])`, not a bare field reference.

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
treats any run of spaces and line breaks alike, and finds text inside longer words. Nothing is
selected.

- Matches are marked in orange; the counter says **3 of 12**, **12 matches** or **No matches**.
- Typing is searched after a short pause, and the first match from where you are reading becomes
  current. The query stays when a selection changes the conversation.
- **Show search box** under **Appearance** hides it.

## Stepping and the overview ruler

The step buttons, F3 and Ctrl+G go through the search matches while a query is typed, and through the
highlights otherwise, across the whole conversation. Steps wrap around at either end.

The **overview ruler** beside the conversation shows where the matches or highlights are, a tick per
place, in the categories' colours; hover to count them, click to go there. **Show overview ruler** under
**Appearance** hides it.

| Keys                                                                | What they do                                                         |
| ------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **Ctrl+F** (**Cmd+F**)                                              | Goes to the search box, from inside the object.                      |
| **Enter** / **Shift+Enter** in the search box                       | The next or the previous match.                                      |
| **F3** / **Shift+F3**, **Ctrl+G** / **Ctrl+Shift+G** (Cmd on a Mac) | The next or the previous match, or highlight when nothing is typed.  |
| **Enter** on a message                                              | Selects the value of the highlight stepped to; otherwise, details.   |
| **Escape**                                                          | Clears the search, lets go of the highlight, then leaves the object. |

## Copying a conversation

Right-click the object for **Copy conversation as text** or **Copy conversation as JSON**. Both copy the
messages the object shows under the current selections, in the order shown.

- **Text** is a transcript: a line with the sender, every recipient and the time, then the message as
  it was written.
- **JSON** holds each message's id, sender, recipients, thread, time, kind, badge, format, body and KPIs,
  and, while highlighting is on, its highlights with their values, categories and offsets — into the
  body, or into `plainText`, the text a markdown message shows — after a summary of the highlight field
  and the counts per category. Search matches are not included.

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
