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
Add Chatbox.qs to a sheet, then add, in this order:

  Dimension 1   Message ID   must be UNIQUE per message
  Dimension 2   Participant  the speaker
  Dimension 3   Thread       optional
  Measure 1     Only([MsgText])
  Measure 2     Count([MsgId])   integrity probe, keep it

The Message ID must be unique. A straight hypercube emits one row per distinct
combination of dimension values, so duplicate ids merge separate messages into
one bubble. The integrity probe measure detects that and the extension warns you
rather than showing a quietly wrong conversation.

Per-message metadata -- timestamps, avatars, accent colours, badges -- is
configured under "Message metadata" in the property panel.

DOCUMENTATION
-------------
https://github.com/ptarmiganlabs/chatbox.qs

LICENCE
-------
MIT. See LICENSE.
