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

Qlik Cloud
  Management console -> Extensions -> Add, and select chatbox-qs.zip.

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

HIGHLIGHTS, SEARCH AND COPYING
------------------------------
Keywords from a field can be highlighted wherever they occur in the messages
and coloured by a category field: see "Highlights" and "Categories" in the
property panel. Clicking a highlight selects its value.

A search box at the top of the object finds text in the conversation shown;
F3 and Ctrl+G step from match to match. "Show search box" and "Show overview
ruler" are under "Appearance".

Right-click the object to copy the conversation as text or as JSON.

DOCUMENTATION
-------------
https://github.com/ptarmiganlabs/chatbox.qs

LICENCE
-------
MIT. See LICENSE.
