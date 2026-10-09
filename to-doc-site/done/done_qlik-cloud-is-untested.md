# Qlik Cloud is untested

_Applies to every released version. This corrects documentation that listed Qlik Cloud as supported
without it ever having been tested there._

## What changed

The requirements used to read _Qlik Sense Enterprise on Windows (primary target) or Qlik Cloud_,
which put Cloud on the same footing as the platform Chatbox.qs is built and tested on. It has never
been run on a Cloud tenant.

Chatbox.qs is built and tested on **Qlik Sense Enterprise on Windows**. Treat **Qlik Cloud** as
untested, and so unsupported, until a test pass on a real tenant has been done.

## Why Cloud is not assumed to work

The extension imports on Cloud the same way it does on Windows — **Management console → Extensions →
Add**, with the `chatbox-qs.zip` file — but several things that decide whether it works are
different there:

- **Content security policy.** Cloud enforces one, with an allowlist per tenant. An origin that is
  not on it does not load, and the object may not render.
- **Media paths.** Content libraries do not exist on Cloud; app media lives at a different address.
- **The property panel** is drawn by a different client.
- **Themes** are Cloud's own, and how the object's colours resolve against them has not been seen.

## What it does not change

Nothing about Qlik Sense Enterprise on Windows. Nothing stops you importing the extension on a
Cloud tenant to try it; it simply has not been tested there.

---

## Notes for the publishing pass — remove before publishing

- Tracked in ptarmiganlabs/chatbox.qs#13. When that test pass is done, replace this page with what
  it found, and move this draft to `done/` unpublished if nothing here is still true.
- The README and the release readme say the same thing; keep the three in step.
