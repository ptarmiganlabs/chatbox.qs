# Docs staging: `to-doc-site`

Files in this folder are drafts of pages for the Chatbox.qs documentation site. They are written and
reviewed here, alongside the change they describe, and published to the documentation site later.

**This file is the authoritative spec for writing them, and records what publishing one needs to
know about Chatbox.qs.** The publishing loop itself is a house rule, named under
[Publishing](#publishing). `AGENTS.md` carries a short pointer to this file and nothing more, so the
rules live in one place and cannot drift apart. Extend this file rather than restating any of it in
an agent instruction file.

## The documentation site

|                    |                                                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Published site     | <https://chatboxqs.ptarmiganlabs.com> — public                                                                                             |
| Source repository  | [ptarmiganlabs/chatbox.qs-docs](https://github.com/ptarmiganlabs/chatbox.qs-docs) — private, cloned at `/Users/goran/code/chatbox.qs-docs` |
| Preview of `next`  | `https://next-chatbox-qs-docs.goran-df8.workers.dev` — staff and reviewers only, behind Cloudflare Access                                  |
| First version line | `/v0.6/` — see [Decisions](#decisions)                                                                                                     |

Its branches, previews, hosting and page conventions are recorded in that repository's `AGENTS.md`,
not here.

**Every user-visible change gets its draft here, in the same commit as the change**, and is
published to the site later, as [Publishing](#publishing) describes. The alternative —
reconstructing the documentation from memory and commit logs — loses exactly the details a reader
needs: why a default is what it is, the exact wording of a message they can search for, what a
setting does _not_ do.

## Why this folder is at the repository root

Honestly: **consistency with the sibling projects. There is no packaging reason here, unlike on some
of them.**

`docs/` in this repository is developer-facing — [`docs/GOTCHAS.md`](../docs/GOTCHAS.md) is
institutional memory about the Qlik engine, nebula and the test suite. These drafts are for people
putting the extension on a sheet. Keeping the two apart keeps both audiences' documents honest, and
is reason enough on its own.

What is _not_ a reason here is leakage into anything a user receives, and it is worth writing down
why so that nobody adds machinery to guard a door that is already shut:

- The extension archive is built by [`scripts/zip-extension.mjs`](../scripts/zip-extension.mjs),
  which globs `chatbox-qs-ext/` — a folder `nebula sense` generates and `.gitignore` excludes.
  Nothing tracked in the repository can reach it.
- The outer release archive is built by
  [`scripts/release-package.mjs`](../scripts/release-package.mjs) from an explicit three-entry list:
  the extension zip, `LICENSE`, and the rendered `readme.txt`.
- `package.json` `files` is an allow-list — `dist`, `chatbox-qs.js`, `chatbox-qs.qext` — so a tarball
  could not carry this folder either.

So there is no `EXCLUDE` entry to add and no guard test to write. If a packager that ships
everything committed is ever introduced, this folder is the first thing to exclude from it, and the
exclusion wants a test that fails when the entry and the folder disagree.

### A pull request touching only this folder runs the full suite

`.github/workflows/ci.yaml` has **no `paths` or `paths-ignore` filter on any trigger**. Do not add
one for this folder. The suite takes seconds, and an allow-list that leaves a path out retires every
check that reads it — a cost paid forever to save one run of a job that was going to pass.

## Purpose

This folder is a **staging area, not the published source**. Nothing here is rendered anywhere; the
site lives in its own repository and is written from these drafts.

|                |                                                                                                                        |
| -------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Published site | <https://chatboxqs.ptarmiganlabs.com>                                                                                  |
| Source repo    | [ptarmiganlabs/chatbox.qs-docs](https://github.com/ptarmiganlabs/chatbox.qs-docs) (private)                            |
| Product repo   | <https://github.com/ptarmiganlabs/chatbox.qs>                                                                          |
| Repo README    | [`README.md`](../README.md) in this repository                                                                         |
| Release readme | [`release-config/readme-template.txt`](../release-config/readme-template.txt), rendered into the outer release archive |

[`README.md`](../README.md) is what somebody reading this repository sees, and the release archive's
`readme.txt` is what somebody who downloaded the zip reads. **A draft here does not excuse leaving
either of those stale** — they are live documentation too, and a user-visible change updates them in
the same commit. The draft is for the page the site carries, at a length and depth the README cannot
hold.

## When to add a file

**When you implement a user-visible change, add a Markdown file here in the same commit as the
change.** For this extension that covers:

- A new or changed **property-panel setting**, including a changed default, a renamed label, or a new
  condition under which a setting is ignored.
- A change to what the **conversation** shows or does: bubbles, lanes, two-sided layout, dates,
  density, highlights, categories, the overview ruler, details, the bar above the conversation.
- A change to **what a click does** — selecting a value, a category, a conversation, a message — or to
  **what the object says back** when a click selects nothing.
- A new or changed **message the extension shows**: a banner, a notice, a disabled control's reason.
  People search the web for those strings verbatim.
- A new **keyboard shortcut**, or a change to what an existing one means. A key that changes meaning
  is the single most important thing to write down, because nothing in the object announces it.
- A change to the **data contract**: which dimensions and measures are required, in which order, for
  which conversation model.
- A change to **installation**, requirements, or supported Qlik Sense versions.
- A **limit** a user can hit — `Maximum messages`, the highlight cap, how many lanes fit — or a
  behaviour that depends on the data model, such as which fields a mode needs to be real fields.
- A change to **export**: what an image or PDF render shows, or degrades to.
- A bug fix a user would notice, or a correction to previously documented behaviour.

**A draft can also be triggered by something with no commit to attach to** — a Qlik Sense release
that changes the host's behaviour, a dead third-party link, a claim found to have been wrong since it
was written. The trigger is then noticing rather than implementing: write the file when you spot it,
and say in it what changed and how you checked.

**Skip it when nothing a user sees changes** — internal refactoring, test-only work, build and CI
changes, dependency bumps, performance work that does not change what is possible.

The question is not whether the change was large, but whether somebody building a sheet with
Chatbox.qs, or installing it, would need to know. A large refactor can warrant nothing; a one-line
change to a default can warrant a file.

## Audience

Drafts are written for **Qlik Sense app developers** who put Chatbox.qs on sheets, and for
**administrators** who install it. Assume the reader:

- Knows Qlik Sense: sheets, fields, dimensions, measures, master items, expressions, set analysis,
  the property panel, and what a selection does.
- May administer a client-managed site, often an air-gapped one, or a Qlik Cloud tenant.
- Has data they did not model themselves and cannot freely reshape.
- Does not read JavaScript for a living, and should not have to.

Say what changes for the reader and what they do about it, not how it was implemented.
Property-panel labels, the extension's own messages, and Qlik expressions are welcome. Source paths,
internal names, React and nebula are not.

## File format

- Markdown (`.md`), **one topic per file — the unit is the topic, not the target page.** One
  behaviour that has to be described on three pages is one draft: one set of facts to verify, one
  decision to review, one preview to approve. Three copies drift apart while they wait. The reverse
  holds too: two unrelated topics that happen to land on the same page are two files.
- Descriptive kebab-case names for the **topic**, not the page it may land on:
  `selecting-a-conversation-from-its-lane-header.md`, not `reference-page-3.md`. Which page a draft
  belongs on is a proposal the publishing pass can overrule, so a name taken from a page turns
  misleading the moment that decision changes.
- Self-contained: do not split a topic across files or rely on the reader cross-referencing.
- **Quote the extension's own strings verbatim** — panel labels, banners, notices, the words on a
  disabled control. A reader searching for what they see on screen has to find the page.
- Screenshots are welcome in a draft as a description of what to capture; do not add binary images
  here. The publishing pass takes them against a real app.

### Draft anatomy

Start with an H1 naming the change as a reader would experience it. Where behaviour changed, follow
it with a one-line italic version gate, which becomes a callout on the site:

```markdown
# The find box and the keywords step separately

_Requires Chatbox.qs 0.6.0 or later._
```

Where the draft corrects documentation rather than describing a change, say that instead — a
correction gates against no version at all:

```markdown
# Automatic density is almost always ultra with conversations side by side

_Applies to every released version. This corrects guidance that has been wrong since lanes were
introduced._
```

Then `## What changed`, `## What it does not change`, and whatever the reader needs to act: the
setting's path through the panel, the keys, the exact messages. `## What it does not change` is the
section readers get most from and writers skip most often — a mode that frees some selections and
not others is defined as much by the ones it leaves alone.

Anything that is context for the publishing pass rather than content for the site goes in a trailing
`---` section headed **`## Notes for the publishing pass — remove before publishing`**: issue and
pull request numbers, ordering hints relative to other drafts, target-page proposals, and anything
the maintainer should decide.

## Processing status

- Files **directly in this folder, without a prefix**, are pending review or publication.
- Files in the **`done/` subfolder, prefixed `done_`**, have been published, verified to exist
  already, or deliberately judged not worth publishing.

Marking a file processed is one `git mv`, so history follows the file:

```bash
git mv to-doc-site/whole-conversations.md to-doc-site/done/done_whole-conversations.md
```

Where the publishing pass did something the draft did not say — landed it on a different page,
corrected a claim, split it in two — record that as a leading HTML comment in the moved file. That
comment is the only record of the decision.

Processed files stay in `done/` for traceability until there is a deliberate cleanup pass.

**When writing a new file, leave it unprefixed and directly in this folder.** The `done_` move
belongs to whoever publishes it, never to whoever writes it.

## Adding a file vs. editing an existing one

Prefer updating an existing unprefixed file on the same topic over adding a second one: a later
change to the same behaviour updates the pending draft, so the publishing pass sees one current
account rather than two partial ones.

If the topic already has a `done_` file, add a new unprefixed file instead, so the record of what was
published stays intact.

---

## Publishing

**The publishing loop is `rules/docs/to-doc-site.md` in plabs-house-rules** — the one copy every
Ptarmigan Labs product follows: scope and order, a critical review of each draft, every claim verified
against the source, the release that ships it, and then one draft, one pull request into the site's
`next`, one preview, one approval, and the `done_` move in the same turn as the approval. It runs only
when asked. It is not repeated here, so that the copies cannot drift apart; what follows is what it
needs to know about Chatbox.qs.

### Run the pass from this repository, at a fresh `origin/main`

The drafts are here, and so is the source every claim is checked against:

```bash
git -C /Users/goran/code/chatbox.qs fetch origin
git -C /Users/goran/code/chatbox.qs show origin/main:to-doc-site/README.md
```

A working tree may be on a feature branch, where a draft that exists looks deleted and a property
panel nobody has released looks current.

### Which source settles which claim

Drafts are written from intent and can be wrong in detail, and so can this repository's `README.md`
about where a setting lives: it says **Show kinds as chips** is "under **Message kind**", where the
panel puts it in **Message metadata**, beside the **Message kind** expression. Read the source at
`origin/main`:

| Claim                                                                        | Settled by                                                                                                      |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| A property-panel label, default or range, and when a setting is shown        | `src/ext/` — one file per panel section                                                                         |
| Which dimension or measure takes which role, in each conversation model      | `src/qix/column-map.js`, `src/qix/role-labels.js`                                                               |
| **Maximum messages**, a message id that is not unique, and their banners     | `src/chat/normalize.js`, `src/chat/message-limit.js`                                                            |
| Which conversations get a lane, and the line that counts them                | `src/chat/lanes.js`, `src/ui/LaneBoard.jsx`                                                                     |
| Whole conversations: what stops narrowing, and when the button is disabled   | `src/qix/whole-conversations.js`                                                                                |
| Which values are highlighted and how they match; the banners and the summary | `src/highlight/settings.js`, `src/match/`, `src/highlight/summary.js`                                           |
| What a click selects, and what the object says in its corner afterwards      | `src/ui/click-route.js`, `src/qix/object-selection.js`, `src/highlight/click-selection.js`, `src/ui/Notice.jsx` |
| Keys                                                                         | `src/ui/keyboard.js`                                                                                            |
| The find box and stepping                                                    | `src/highlight/navigator.js`                                                                                    |
| Copying: the text transcript, the JSON and its `schemaVersion`               | `src/export/`                                                                                                   |
| The object's context menu                                                    | `src/index.js`                                                                                                  |
| What an image or PDF export shows                                            | `src/ui/snapshot.js`                                                                                            |
| Qlik Cloud                                                                   | [#13](https://github.com/ptarmiganlabs/chatbox.qs/issues/13): untested until it is closed                       |

Where behaviour can only be seen in Qlik Sense, the source says what is meant to happen and a live
site says what does; leave out what neither has settled rather than guessing.

### Which release ships it

- **The pending version** is in the open release-please pull request's title,
  `chore(main): release chatbox-qs X.Y.Z`. A version number written in a draft is evidence of nothing
  — most of these drafts were written before the release they describe had a number.
- **Tags carry the package name**: `chatbox-qs-vX.Y.Z`. A bare `vX.Y.Z` finds nothing.
- **A tag does not mean the release is out.** Releases are created as drafts, and since 0.6.1 the tag
  is made with the draft, before the archive is attached and the release is published by hand.
  `gh release view chatbox-qs-vX.Y.Z --json isDraft` says which.

### Decisions

- **The site is public**, and so is everything published to it (Goran, 2026-10-09). Its previews are
  not: they show behaviour no release has shipped yet.
- **`/v0.6/` is the first line** (Goran, 2026-10-09). Releases go back to 0.2.0, but the site opened
  at 0.6: nothing up to 0.6.0 is gated or given a history, so a draft's "Before 0.6.0 …" is dropped
  when it is published. Gates start after 0.6.0, the 0.6.x patch releases included.
- **The first content is one exception to the loop** (Goran, 2026-10-09). The thirteen drafts
  written before the site existed are published in section-sized pull requests, each page written
  once from every draft that touches it, each pull request reviewed on the preview, and all thirteen
  then moved to `done/`. The exception is spent once they are; every draft after them goes through
  the loop as written.

## Ownership

These drafts are maintained by the Chatbox.qs maintainers. Pull requests and issues are welcome.
