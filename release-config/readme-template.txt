Chatbox.qs __VERSION__
======================

Render chat-style conversations from the Qlik Sense data model.

WHAT IS IN THIS ARCHIVE
-----------------------
  chatbox-qs.zip   The extension. This is the file you upload to Qlik Sense.
  LICENSE          MIT licence.
  readme.txt       This file.

INSTALLING
----------
Qlik Sense Enterprise on Windows
  QMC -> Extensions -> Import, and select chatbox-qs.zip.

Qlik Cloud -- untested
  Management console -> Extensions -> Add, and select chatbox-qs.zip.
  Chatbox.qs is built and tested on Qlik Sense Enterprise on Windows. It has
  never been run on a Cloud tenant, so treat Cloud as unsupported for now.

Do NOT unzip chatbox-qs.zip first. Sense expects the archive.

USING IT
--------
Add Chatbox.qs to a sheet. Under "Conversation" in the property panel, choose
the conversation model BEFORE adding dimensions, then add, in this order:

Participants (default) -- one dimension holds every speaker:

  Dimension 1   Message ID   must be UNIQUE per message
  Dimension 2   Participant  the speaker
  Dimension 3   Thread       optional
  Dimension 4   To           optional recipient
  Measure 1     Only([MsgText])
  Measure 2     Count([MsgId])   integrity probe, keep it

From -> To -- a sender and a recipient, for one-to-one conversations:

  Dimension 1   Message ID   must be UNIQUE per message
  Dimension 2   From         the sender
  Dimension 3   To           the recipient, one per row
  Dimension 4   Thread       optional
  Measure 1     Only([MsgText])
  Measure 2     Count([MsgText])   integrity probe; count a field only the
                                   messages table has, not a key field

In From -> To, a message to several people is shown as one bubble listing
them. Spell each person identically in From and To.

The Message ID must be unique. A straight hypercube emits one row per distinct
combination of dimension values, so duplicate ids merge separate messages into
one bubble. The integrity probe measure detects that and the extension warns you
rather than showing a quietly wrong conversation.

Per-message metadata -- timestamps, avatars, accent colours, badges -- is
configured under "Message metadata" in the property panel.

CONVERSATIONS SIDE BY SIDE
--------------------------
"Show conversations side by side" under "Conversation" gives each value of the
Thread dimension a lane of its own, the latest activity first.

Clicking a lane's header selects that conversation, the way a filter pane
selects: pick one header, then another, then confirm or cancel them together.
Where there are more conversations than fit, the bar steps through them a
windowful at a time -- 1-4 of 12 -- down the same ranking.

WHOLE CONVERSATIONS
-------------------
Selecting a person leaves only the lines that person wrote, which is what Qlik
was asked for and rarely what was meant. Turn on "Show whole conversations" --
in the bar above the conversation, or as a default under "Conversation" -- and
you get the chats they took part in, whole: their own messages drawn as
answers, the rest dimmed as context.

Selections on the participant, From, To, highlight and category fields stop
narrowing; every other selection still narrows, so a date as well gives you
that day's messages of their chats.

It needs the Message ID, the people and the conversation dimensions to be
fields rather than expressions -- there is no field to free in an expression --
and the object to be in the default state, since it widens against the default
state's selection. Where either is not so, the button is disabled and says why.
The object reads a copy of its own cube in an empty session alternate state:
nothing is written to your app, and selections behave exactly as they always
have. An image or PDF export cannot make that state, so it shows the strict
conversation.

The widened cube weighs every message in the app rather than only the ones
read, so on a very large table expect the first draw after a selection to take
noticeably longer than the strict view.

HIGHLIGHTS, SEARCH AND COPYING
------------------------------
Keywords from a field can be highlighted wherever they occur in the messages
and coloured by a category field: see "Highlights" and "Categories" in the
property panel. Clicking a highlight selects its value, and the corner says
what was selected and in which field.

The bar above the conversation holds a find box and, once a highlight field is
set, a keyword stepper. The two are stepped separately: F3 and Ctrl+G go
through the find box's matches, Alt+Down and Alt+Up through the keywords.
Before 0.6.0 one pair of buttons stepped both and F3 meant whichever had
something in it. "Show search box" and "Show overview ruler" are under
"Appearance".

"Text size" in the bar sets how large the conversation is drawn -- bodies,
names, times, badges -- while Density goes on deciding spacing and avatars.

Right-click the object to copy the conversation as text or as JSON. One
message on its own is copied from the button in its upper corner, which
appears under the pointer or the keyboard; "Show copy button on messages"
under "Appearance" takes it away.

DOCUMENTATION
-------------
https://chatboxqs.ptarmiganlabs.com

Source and issues: https://github.com/ptarmiganlabs/chatbox.qs

LICENCE
-------
MIT. See LICENSE.
