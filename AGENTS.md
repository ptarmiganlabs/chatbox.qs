# AGENTS.md

A pointer file. The rules live in the documents it names, so that there is one copy of each and they
cannot drift apart. Extend those, not this.

## Documentation drafts

**When you implement a user-visible change, add a Markdown draft to
[`to-doc-site/`](to-doc-site/) in the same commit.**

[`to-doc-site/README.md`](to-doc-site/README.md) is the authoritative spec — what counts as
user-visible, who the reader is, how to write a draft, and the whole publishing loop. Read it before
writing or publishing anything. Its rules are deliberately not repeated here.

The documentation site does not exist yet; drafts accumulate until it does. That is not a reason to
skip one, and it is not a reason to leave [`README.md`](README.md) or the release archive's readme
([`release-config/readme-template.txt`](release-config/readme-template.txt)) stale — those two are
the live documentation, and a user-visible change updates them in the same commit as well.

## What this repository has learned the hard way

[`docs/GOTCHAS.md`](docs/GOTCHAS.md) is developer-facing institutional memory: the Qlik engine and
nebula behaviours that cost real debugging, each entry naming the test that guards it. Read it before
changing how the object talks to the engine, and add to it when something costs a day.

## Everything else

[`README.md`](README.md) documents the extension for the people who use it, and its **Development**
section covers the build, the test suite and the release process.
