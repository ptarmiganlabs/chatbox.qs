# Project logo

Chatbox.qs's own identity. Everything here is generated from the SVG sources in
this directory — edit an SVG, then run `./render.sh`; never hand-edit a PNG.

## Sources

| Source                        | What it is for                                                                                                                                                                                                                      |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chatbox-qs-logo.svg`         | The logo: card, glyph, wordmark. READMEs, docs, slides. **Also the extension's `preview.png`.**                                                                                                                                     |
| `chatbox-qs-mark.svg`         | Glyph only, on the same pale card. Avatars, or beside a heading that already says the name.                                                                                                                                         |
| `chatbox-qs-fullbleed.svg`    | Glyph with no card, edge to edge. **Every favicon and OS app icon.** Carries no rounded corners of its own because each platform masks icons to its own shape — art with its own corners ends up visibly inset inside the system's. |
| `chatbox-qs-lockup.svg`       | Horizontal: glyph left, wordmark right, transparent background. Blog headers and anything wider than it is tall.                                                                                                                    |
| `chatbox-qs-logo-on-dark.svg` | Inverted card for dark slides and dark READMEs.                                                                                                                                                                                     |
| `chatbox-qs-mono.svg`         | One colour, `currentColor`, no gradients. Safari pinned tab, print, stamps.                                                                                                                                                         |
| `chatbox-qs-og.svg`           | 1200 × 630 link card, with tagline.                                                                                                                                                                                                 |
| `chatbox-qs-social.svg`       | 1280 × 640, GitHub's repo social preview size.                                                                                                                                                                                      |
| `chatbox-qs-square.svg`       | 1200 × 1200, square social post.                                                                                                                                                                                                    |
| `chatbox-qs-hero.svg`         | 1200 × 600 blog header.                                                                                                                                                                                                             |

## Where the output goes

| Directory                    | Contents                                                   |
| ---------------------------- | ---------------------------------------------------------- |
| `docs/logo/`                 | Sources, plus logo PNGs at 128/256/512 and mark at 128/256 |
| `assets/logo/`               | Social cards, blog hero, 1024 rasters                      |
| `assets/logo/docs-site/`     | Web favicon set for the documentation site                 |
| `preview.svg`, `preview.png` | Repo root — the extension's asset-panel preview            |

Regenerate everything:

```bash
docs/logo/render.sh
```

It needs `rsvg-convert` and ImageMagick, both outside npm on purpose: nothing
here is needed to build, test or run the extension.
`brew install librsvg imagemagick` on macOS.

## What is wired up, and what is not

Already in place:

- **The extension's preview** — `src/meta.json` names `preview.png`, and
  `nebula sense` copies it into the generated extension folder, so it is what
  the Sense asset panel shows. `render.sh` writes it at 280 × 280, matching
  audit.qs and QvsView.qs. `preview.svg` sits beside it as the editable
  original; Sense never reads it.

Still manual:

- **GitHub repo social preview** — upload `assets/logo/chatbox-qs-social.png`
  under Settings → General → Social preview. There is no API for it.
- **Blog and `og:image` tags** — use `assets/logo/chatbox-qs-og.png`, and
  `assets/logo/chatbox-qs-hero.png` for the header image.
- **Documentation site favicons** — `render.sh` writes the set to
  `assets/logo/docs-site/`, but the site lives in its own repository, so
  copying them into its `public/` is a manual step. Re-copy after any change to
  `chatbox-qs-fullbleed.svg`.

## Why it looks like this

The shape language is shared with the other Ptarmigan Labs `.qs` tools — a
140 × 140 rounded card, a pale diagonal gradient behind one flat glyph, the
product name in 12 px semibold beneath. Each tool gets its own hue, so a row of
them reads as a family. Audit.qs is amber, HelpButton.qs blue, Onboard.qs
green, Persona teal, QvsView.qs and Guide.qs purple. This one is rose, the
nearest clearly distinct hue still unclaimed.

The glyph is a **speech bubble whose tail points down into three participant
dots**, rather than off into empty space. That is the extension's actual claim:
a conversation belongs to a _set_ of participants, not to two sides. The dots
are the first three colours of the fallback palette in
`src/chat/participants.js` — change them there and they should change here.

`#EE6677`, the palette's second colour, is skipped in the glyph because it is a
rose and would disappear into the card. The spectrum bar across the foot of the
social cards carries the full palette instead, where there is room for it.

## Palette

| Role             | Value                                                                  |
| ---------------- | ---------------------------------------------------------------------- |
| Card background  | `#FDF1F6` → `#F6D5E3` (diagonal)                                       |
| Glyph            | `#E5477C` → `#A61B52` (vertical)                                       |
| Wordmark         | `#A61B52`                                                              |
| Participant dots | `#4477AA`, `#CCBB44`, `#228833`                                        |
| Dark card        | `#3A1020` → `#22070F`, glyph `#F2679A` → `#D93B70`, wordmark `#F2A8C4` |

## Known limits

- The **lockup's wordmark is `#A61B52`**, which is dim on a dark ground. On dark
  surfaces use `chatbox-qs-logo-on-dark.svg` instead. Persona has the same
  limitation; there is no dark lockup in the family yet.
- The **fullbleed dots are larger and further apart** than the logo's
  (r47/pitch 106 against the logo's r9/pitch 14 scaled). At 16 px the logo's
  proportions broke into a checkerboard, because `#CCBB44` is much lighter than
  its neighbours and three sub-pixel dots of unequal value do not read as
  three. Keep them apart if you touch that file.
