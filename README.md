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

Per-message metadata is configured under **Message metadata** in the property panel. Each expression
must aggregate — `Only([Field])`, not a bare field reference.

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
