<!--
Published 2026-11-18 in ptarmiganlabs/chatbox.qs-docs#25, to production in #26, into the v1.0 line
that #24 opened for 1.0.0.
Page: Usage → Copying and exporting (/v1.0/usage/copying/), new section "Exporting the whole
conversation", and a tip in its "Image and PDF exports" section pointing to it.
Differences from the draft: a section of the existing Copying page rather than a page of its own; no
version gate, because the v1.0 line starts at 1.0.0; the day-separator example says the date is
written in the browser's language. No screenshots yet.
Every quoted string was checked against src/ at origin/main (1.0.0). Live checks before release:
lane preselection, PNG slides, an 8,000-message HTML export, the print frame and a real Save as PDF.
Goran reviews the pass in production; merging this pull request is his approval.
-->

# Export a whole conversation as a PDF, PNG images or an HTML file

_Requires Chatbox.qs 0.7.0 or later._

## What changed

Right-click a Chatbox.qs object for **Export conversation…**. It exports **every message the object
holds** under the current selections, including the ones scrolled out of sight, as a PDF, as PNG images
or as an HTML file. The export is designed for reading and for presentations, not copied pixel for pixel
from the screen: a single conversation is a column of comfortable width, never the width of the paper,
and conversations side by side are laid out in columns lined up in time.

The item is on the object's context menu below **Copy conversation as text** and **Copy conversation as
JSON**, and like them it appears only while a conversation is shown.

### The dialog

The dialog opens over the object.

- **Conversations** appears only with conversations side by side. **This one: _name_** exports the
  conversation you right-clicked, and is chosen to begin with. **All _N_ shown, side by side** exports
  every conversation that has a lane, lined up in time. Right-click outside a lane (on the bar, say) and
  only **All _N_ shown, side by side** is offered.
- **Format** is **PDF**, **PNG** or **HTML**, with a line under it saying what that format does.
- **Image** appears for PNG: **Slide-sized, 16:9** or **One tall image**, and **Transparent background**.
- **Content** has **Title with people, dates and counts**, ticked by default.
- **Export** runs it; **Cancel** or **Escape** closes the dialog. While a PNG is drawn, the dialog says
  which image it is on, e.g. **Drawing image 3 of 12…**.

The dialog remembers the last format and options for as long as the object is open.

### PDF

**PDF** opens the browser's print dialog, with the line **Opens the print dialog: choose Save as PDF
there.** in the export dialog. Choose **Save as PDF** (or **Microsoft Print to PDF**) as the destination.

- One conversation prints portrait; several side by side print landscape. Several that are wider than
  the paper are scaled down to fit it.
- A message is never split across two pages.
- With several conversations, their names repeat at the top of every page, and every page ends with the
  date of the export.
- The text stays text: it can be selected, searched and copied in the PDF.
- The page takes the theme's background, edge to edge. Chrome and Edge leave out their own header and
  footer (the address and the date), since the page has no margin to print them in.

### PNG

- **Slide-sized, 16:9** makes images of 1920 × 1080 pixels, or wider in proportion for several
  conversations side by side, each ready to paste onto a slide. The conversation names repeat at the
  top of each, and each ends with the date and which image it is, e.g. **2 of 5**.
- **One tall image** makes one image of the whole conversation, cut into several only when it is taller
  than a browser can draw in one: about 32,000 pixels, roughly 150 to 200 messages of one conversation,
  depending on their length.
- Images are always cut between messages, never through one. A slide that would be a few lines over
  shrinks slightly to hold them rather than leave one message on a slide of its own, and a single
  message taller than a slide shrinks to fit it.
- One image is saved as a `.png`; several are saved together as one `.zip`, numbered in order.
- **Transparent background** leaves out the page's background, so the bubbles sit on the slide's own.
- Images are drawn at twice their size on screen, so they stay sharp when a slide is projected.

### HTML

One self-contained file that opens in any browser. It holds no script. Avatars are embedded where the
browser allows it. It names the theme's font but does not carry it, so a reader who does not have that
font installed sees their own system font.

### The title block

**Title with people, dates and counts** opens the export with:

- the conversation's name: the thread's when one conversation is exported, the object's title when
  several are (or **_N_ conversations** when the object has no title);
- its people: every name when there are five or fewer, otherwise the first four and **and _N_ others**;
- the days it covers, e.g. **September 8 – 9, 2026**;
- how many messages, and with several, how many conversations;
- a legend of the highlight categories that occur in it, when **Show legend** is on;
- a note when **Maximum messages** left messages out, e.g. **Older messages are not included: only the
  newest 5,000 of 9,000 messages were read.**, and a note when whole conversations are on: **Faded
  messages are context: they are in the same conversations, but outside the selection.**

Untick it for a slide that has a title of its own. The footer then still says **Not every message is
included** when Maximum messages cut the conversation short.

### How it looks

- The app's theme colours, a dark theme included.
- Highlights and their categories as the object draws them, category labels included when **Show
  category labels** is on.
- Day separators name the date itself, e.g. **Tuesday, September 8, 2026**, never **Today** or
  **Yesterday**: an export is read later.
- A participant colour too pale to read as a name against the page is darkened, or on a dark theme
  lightened; initials on a pale avatar are written in near-black.
- Avatars appear as they do in the object, unless **Show avatars** is off. In a PNG, an avatar from a
  site that does not allow it to be copied is drawn as initials.
- Messages given as context by whole conversations are faded, as on screen.

### File names

Files are named after the object's title, the conversation when one is exported on its own, and the
day: `Support chats - Order 1042 - 2026-11-18.pdf`, `Support chats - 2026-11-18.zip`. Images in a zip
are numbered: `Support chats - 2026-11-18 - 01.png`.

### What the object says

The corner of the object says what was done:

- **Saved 42 messages as HTML**
- **Saved 42 messages as an image**
- **Saved 120 messages as 6 images in a zip**
- **Opened the print dialog for 42 messages**
- **The export did not work:** followed by the reason.
- **This browser would not let the conversation be saved as an image. Try PDF or HTML.**

## What it does not change

- **Sense's own export is unchanged.** **Download as image** and **Download as PDF** on the object, and
  a snapshot in a story, still draw the object once, at one size, showing the part on screen. That is
  how Qlik Sense exports any object, and why this export exists: it cannot show more than fits.
- **The export holds what the object holds.** Selections narrow it as they narrow the object, **Maximum
  messages** caps it as it caps the object, and with conversations side by side only the conversations
  that have a lane are exported. Select or step to the others first.
- **Search matches are not marked** in an export; keyword highlights are.
- **Nothing is sent anywhere.** The file is made in the reader's browser and saved as a download; it
  works on an air-gapped site.
- **Copy conversation as text** and **as JSON** are unchanged, and remain the way to get the
  conversation into another program.

---

## Notes for the publishing pass — remove before publishing

- The version gate assumes this ships as a feature in the next minor release; check the open
  release-please pull request's title.
- Proposed page: a new **Exporting a conversation** page beside **Copying a conversation**, linked from
  the page on conversations side by side.
- Screenshots to take against the test app: the dialog with conversations side by side (**This one**
  chosen), a 16:9 PNG of three lanes, and the first page of a landscape PDF. A dark theme example of each
  would show that the theme carries.
- Verified in Chromium (the PNG drawing and the print layout) before the first Sense deployment. Safari
  is untested: the transparent-background PNG and the PNG drawing in general rely on the browser
  allowing an SVG image to be drawn on a canvas, and the notice above is what a refusal looks like.
- Firefox applies the print scaling of wide boards only from version 126.
