# An image or PDF export shows the conversation, not an error

_Requires Chatbox.qs 0.6.5 or later. Earlier versions often exported only an error._

## What changed

Exporting a Chatbox.qs object to an image or a PDF — from the object's menu, or by exporting a sheet or a
story that holds it — used to give, for most conversations, an export with no messages in it, only:

> Could not load the conversation
>
> model.getHyperCubeData is not a function

Qlik Sense makes an export by drawing the object again on its server from a copy of the object's state,
and there the object cannot ask the engine for data. Chatbox.qs asked anyway whenever the messages shown
were not all in the first batch of rows Sense hands every object. That covered almost every real
conversation:

- **Order** set to **Newest first**,
- **Conversations side by side** switched on,
- more than 1,000 messages, the size of that first batch,
- more than ten dimensions and measures together, which leaves the first batch empty.

The object now hands the messages on screen to the export when the export is made, and the export draws
those. It shows the conversation the reader was looking at, scrolled to where they were and with the
lanes they had on screen.

With **Whole conversations** on, the export shows the widened conversation the reader had on screen,
with its context messages dimmed. Earlier versions documented that an export showed only the strict
conversation; it now shows the same messages as the sheet.

## What it does not change

- **Highlights and the search box** are still left out of an export. Both need the engine, which an
  export does not have.
- **Maximum messages** still applies. An export shows the messages the object had read, so a
  conversation cut short on the sheet is cut short in the export too, with the same banner.
- A **story snapshot saved with an earlier version** keeps what was saved. It now shows the messages it
  holds rather than the error, but it may hold only the first batch of rows: the oldest messages rather
  than the newest. Take the snapshot again to get the conversation as it is on the sheet.
- Nothing is selected by a click in an export, as before.

---

## Notes for the publishing pass — remove before publishing

- Bug report: an export to image or PDF showed only an error message "about a hypercube". There was no
  issue number when this was written; add it if one is filed.
- The gate says 0.6.5 because that was the open release pull request (`chore(main): release chatbox-qs
0.6.5`) when this was written. Check which release ships it before publishing.
- **Correction to a published page:** `done_whole-conversations.md` says "An image or PDF export cannot
  use the mode and shows the strict conversation." Change that wherever it landed on the site (the
  Whole conversations page) to say what this draft says.
- Target pages: a line on the export or troubleshooting page, under the error text above so a search
  for it finds the page, and the correction on the Whole conversations page.
- Not yet checked in a real Qlik Sense export. The fix is covered by unit tests of the snapshot round
  trip; confirm on the lab site before publishing, and screenshot an exported Newest-first
  conversation.
