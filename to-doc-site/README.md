# Docs staging: `to-doc-site`

Files in this folder are drafts of pages for the Chatbox.qs documentation site. They are written and
reviewed here, alongside the change they describe, and published to the documentation site later.

**This file is the authoritative spec for writing them and for publishing them.** `AGENTS.md`
carries a short pointer to it and nothing more, so the rules live in one place and cannot drift
apart. Extend this file rather than restating any of it in an agent instruction file.

## The documentation site does not exist yet

There is no `chatbox-docs` repository and no published site. **That changes nothing about writing
drafts.** Every user-visible change still gets its draft here, in the same commit as the change.
Drafts accumulate until a documentation repository is created, and are then published one at a time,
as [Publishing](#publishing-once-the-documentation-site-exists) describes.

The alternative — reconstructing the documentation from memory and commit logs once a site exists —
loses exactly the details a reader needs: why a default is what it is, the exact wording of a
message they can search for, what a setting does _not_ do.

Sibling projects are further along and their conventions are worth reading rather than guessing at:
[magpie-cli](https://github.com/ptarmiganlabs/magpie-cli)'s `to-doc-site/README.md` is the fullest
version of this spec and describes a live publishing loop; textview.qs is in the same position as
this repository.

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
site, when it exists, will live in its own repository and be written from these drafts.

|                |                                                                                                                        |
| -------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Published site | Does not exist yet                                                                                                     |
| Source repo    | Does not exist yet                                                                                                     |
| Product repo   | <https://github.com/ptarmiganlabs/chatbox.qs>                                                                          |
| Interim docs   | [`README.md`](../README.md) in this repository                                                                         |
| Release readme | [`release-config/readme-template.txt`](../release-config/readme-template.txt), rendered into the outer release archive |

Until the site exists, [`README.md`](../README.md) is what a user actually reads, and the release
archive's `readme.txt` is what somebody who downloaded the zip reads. **A draft here does not excuse
leaving either of those stale** — they are the live documentation, and a user-visible change updates
them in the same commit too. The draft is for the page the site will eventually carry, at a length
and depth the README cannot hold.

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

## Publishing (once the documentation site exists)

Publishing is **not a bulk pass.** Drafts are processed one at a time, start to finish, each approved
individually once its result can be previewed.

1. **Establish scope and order, and present the plan.** Read every pending draft before publishing
   the first. Order them by dependency: a draft that renames a setting goes before every draft that
   mentions it. A draft saying something is "not yet available" is suspect — check whether the
   follow-up landed. Present the order and wait for approval before touching the doc repository.
2. **Review each draft critically.** Should it be published at all? Where does it fit — prefer
   editing an existing page over adding one? What wording and cross-links does it need?
3. **Verify every claim against the implementation.** Drafts are written from intent and can be
   wrong in detail, and a backfilled draft can be wrong about a release it was written after.
   Property-panel labels and defaults come from `src/ext/`; the extension's messages come from the
   code that renders them; the behaviour of a mode comes from the code that decides it, not from the
   draft's description of it.
4. **Establish which version ships the behaviour.** Read the open release-please pull request's
   title for the pending version and `gh release list` for what is published. A version number in a
   draft is evidence of nothing — most of these drafts were written before the release they describe
   had a number. Gate changed behaviour with a "Requires Chatbox.qs X.Y.Z or later" note wherever a
   reader may be running an older build.
5. **Land it, preview it, report it, wait.** One draft per pull request in the documentation
   repository. Report the preview URL of each changed page with a short summary of what changed.
   When the owner approves, move the draft into `done/` in the same turn — the approval of the
   published page _is_ the authorisation for the move; asking again leaves the folder claiming
   outstanding work that does not exist — then take the next draft.

When a documentation repository is created, record its branch model, preview URLs and access rules
**there**, and link it from here. Do not copy them into this file.

## Ownership

These drafts are maintained by the Chatbox.qs maintainers. Pull requests and issues are welcome.
