# Seeing the whole conversation a person is in

_Requires Chatbox.qs 0.6.0 or later._

## What changed

Selecting a person in a chat has always left only the lines that person wrote. That is what Qlik was
asked for and it is rarely what was meant: the question behind the selection is usually _which chats
is Ada in_, and the answer wanted is the exchange, not her half of it.

**Show whole conversations** answers the second question. With it on, selecting `Author = Ada` gives
you the conversations Ada took part in, whole: her own messages drawn as they always are, and the
messages that do not match the selection dimmed, because they are there to give hers their context.

It can be turned on in two places, and they mean different things:

- **Conversation → Show whole conversations** in the property panel is what the app developer
  chooses. It is the default every reader starts with.
- **The toggle in the bar above the conversation** — two speech bubbles — is the reader's own, for as
  long as they have the object open. It gives way the moment the setting itself changes, so a
  developer who changes their mind is not overruled by a reader's old preference.

The bar says what it is showing while the mode is on, for example **24 messages in 3 conversations ·
8 matching the selection**, so nobody has to wonder why messages they did not select are on screen.

## Which selections stop narrowing

A conversation is in scope when **any** of its messages survives the selection as you made it.
Inside those conversations, these selections stop narrowing:

- The **Participant** field, or **From** and **To** in the From → To model.
- The **highlight field** and the **category field**, if you have set them. Selecting the category
  _ops_ means _show me the chats where ops came up_, whole — not the four lines that said so.

## What it does not change

- **Every other selection still narrows.** Pick a date as well and you see that day's messages of
  Ada's conversations, not their whole history. The mode frees the fields that identify people and
  keywords; it does not make the object ignore your selections.
- **Nothing is selected on your behalf, and nothing is written to your app.** The selection bar shows
  exactly what you selected, and clicking a message still selects in the field it always did.
- **Sense's back button gains one step, once.** The first time the mode is turned on after the page
  loads, the object empties a private selection state of its own, and Sense records that as a step
  in its history like any other. After that, the back button undoes your own selections one at a
  time, with nothing of the extension's in between.
- **The strict view is still there.** Turn the mode off and the conversation narrows again.

## What it needs

**Message ID**, the people dimensions and the conversation dimension must be real fields rather than
expressions. Freeing a field from a selection means naming it, bounding a conversation means
selecting in one, and an expression has no name to use. **The object must also be in the default
state**: the mode widens against the default state's selection, so an object that reads in an
alternate state would show conversations chosen by selections
it does not follow.

Where any of that is not so, the toggle is disabled, and hovering it says what is in the way, rather
than widening some conversations and not others with nothing on screen to show it:

- _Whole conversations need the default state, not the alternate state Comparison._ — naming the
  object's state.
- _Whole conversations need a Message ID dimension on a field._
- _Whole conversations need Participant on a field, not an expression._ — naming whichever roles
  are expressions, for example _From and To_, or _Conversation_.

An image or PDF export cannot use the mode and shows the strict conversation.

## What it costs

The conversations in scope are worked out across every message in the app, not only the ones
`Maximum messages` reads. On a 12,000-message app that is under a tenth of a second. It grows with
the table, so on a very large one expect the first draw after a selection to take noticeably longer
than the strict view. The cost is the same whether or not anything is selected: the mode being on is
what does the work.

A widened conversation also holds more messages than a narrow one, so `Maximum messages` is reached
sooner. The banner above the conversation says when it was.

---

## Notes for the publishing pass — remove before publishing

- Shipped in ptarmiganlabs/chatbox.qs#61. Backfilled: this folder arrived after the feature.
- The version gate says 0.6.0 on the strength of the pending release-please title. Confirm against
  `gh release list` before publishing.
- Publish **before** `the-find-box-and-the-keywords-step-separately.md` and the two lane drafts —
  they mention the bar, and this is the draft that introduces it as more than a summary line.
- Proposed page: a new one under a "Working with selections" heading, with
  `selecting-a-conversation-from-its-lane-header.md` beside it.
- Worth a screenshot: Ada selected, mode on, one lane showing dimmed context around two undimmed
  answers. Capture against the scratch app's **chatbox.qs highlights 2** sheet.
- The alternate-state and conversation-dimension refusals landed with ptarmiganlabs/chatbox.qs#62's
  last pull request. The state is read from the object's layout, which should report a state the
  object inherits from its sheet as well as one set on the object; that inheritance has not been
  checked against a real sheet. Check it before saying that a state set on the sheet counts too.
- The undo-step sentence comes from `docs/GOTCHAS.md` entry 54, which measured it. On an error path
  the state is emptied again and adds another step; that is not worth a reader's attention.
