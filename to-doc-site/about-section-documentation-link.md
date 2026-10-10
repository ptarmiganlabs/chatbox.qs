# The Documentation link opens the documentation site

_Requires Chatbox.qs 0.6.4 or later._

## What changed

**About → Documentation**, in the last section of the property panel, opens the documentation site,
`https://chatboxqs.ptarmiganlabs.com`. Before 0.6.4 it opened the GitHub repository, whose README was
then the only documentation there was.

## What it does not change

- **Report an issue**, below it, still opens the repository's issue list on GitHub. Questions and bug
  reports are still filed there.
- The extension still loads nothing from outside the Qlik Sense server. The site's address is only
  the target of a link, so an air-gapped installation behaves as before: the link is there, and leads
  nowhere without internet access, as the GitHub one did.

---

## Notes for the publishing pass — remove before publishing

- A `fix:` commit, so that release-please ships it in 0.6.4, with the corrected panel texts of
  chatbox.qs#88 (release pull request chatbox.qs#85).
- No page describes the About section today. If none should, this draft can go to `done/`
  unpublished; if one should, the Reference is the place, with **Report an issue** beside it.
