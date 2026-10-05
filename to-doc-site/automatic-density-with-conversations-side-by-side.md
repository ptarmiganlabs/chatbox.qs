# Automatic density with conversations side by side

_Applies from Chatbox.qs 0.4.0, when conversations side by side arrived. Nothing about it changed;
this describes what it has always done._

## What it does

**Appearance → Density** set to automatic picks the spacing for the space the conversation has:
**comfortable**, **compact** or **ultra**. With **Show conversations side by side** on, that space is
**one lane**, not the whole object — each lane is drawn like a tile as narrow as it is.

That usually means **ultra**:

- A lane is at least 220 pixels wide, and the object fits as many lanes as it can, up to **Most
  conversations side by side** (default 4). So most lanes end up between 220 and 320 pixels wide.
- At 320 pixels or less, automatic density is **ultra**: no avatars, 11-pixel text, and the tightest
  spacing.

For example, an 810-pixel object showing three conversations gets three 270-pixel lanes, all at ultra.

Lanes come out wider, and roomier, in two cases: when the object is wide for its **Most conversations
side by side**, and when there are fewer conversations than would fit. A 1,400-pixel object with four
lanes gives 350-pixel lanes at **compact**; the same object with only two conversations gives
700-pixel lanes at **comfortable**.

## Getting avatars and more room back

Set **Appearance → Density** to **compact** or **comfortable**. A density set there is used as it is,
for every lane, whatever their width.

From 0.6.0, **Appearance → Text size** sets the size of the text on its own, so text can be made
larger without changing the spacing — but it does not bring the avatars back. Only the density does.

## What it does not change

- Nothing about a single conversation: without lanes, automatic density follows the object's size, as
  it always has.
- Nothing about how many lanes are shown or how they are ranked.

---

## Notes for the publishing pass — remove before publishing

- Decided in ptarmiganlabs/chatbox.qs#42, option 3: keep the behaviour and document it. The other two
  options — lane-specific width limits, or the object's size capped at compact — were declined.
- Belongs on the lanes page, beside `stepping-through-conversations.md`.
- The pixel figures come from the code at the time of writing (`MIN_LANE_WIDTH_PX` 220, ultra at 320
  or less, compact at 520 or less) — confirm them against `src/chat/lanes.js` and `src/ui/density.js`
  before publishing.
- Worth a screenshot of the same board twice: automatic (ultra, no avatars) and **Density** set to
  comfortable.
