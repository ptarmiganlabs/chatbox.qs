# Gotchas

Traps this extension has already hit. Every one of them produced **silently wrong output rather than
an error**, which is what makes them expensive: the build passes, the package uploads, and the defect
only appears inside a running Sense client.

Each has a regression test. If you are tempted to "simplify" one of these, read the test first.

## 1. `qIsNull` is set on string-valued measures

A measure returning text — `Only([MsgText])`, which is how message bodies arrive — has a null
_numeric_ value, so the engine sets `qIsNull` on a cell whose `qText` is perfectly good.

Guarding on `qIsNull` blanked every message body while dimensions rendered fine.

**Rule:** read `qText` unconditionally. Qlik's own `sn-table` and `sn-pivot-table` contain **zero**
references to `qIsNull` in their entire source. `num()` still guards it, because a null number really
is null.

_See `src/qix/read-cell.js`._

## 2. Qlik timestamps are day serials, not epoch milliseconds

`Num(Min([SentAt]))` returns **46273.34** — days since 1899-12-30 — not `1788855124000`.

Comparing serial deltas (~0.0009) against a millisecond threshold (120000) meant time-based message
grouping could never fire. Nothing errored; the feature was simply inert.

**Rule:** everything time-related goes through `qlikTimeToEpochMs()`. It passes values above 1e11
through untouched, since no real day serial reaches that.

_See `src/chat/sanitize.js`._

## 3. The engine's `'-'` null sentinel is a valid relative URL

The engine returns `'-'` for a null value. `new URL('-', base)` resolves happily to `https://host/-`
with an allowed scheme, so a null avatar expression reached the DOM as `<img src="-">` — which
requested the hub page and permanently suppressed the initials fallback for that participant.

**Rule:** `'-'` is checked explicitly in `safeUrl()` and `attrText()`, not just empty strings.

## 4. Babel and Rollup can disagree about the build mode

`@babel/preset-react` derives its `development` flag from `BABEL_ENV || NODE_ENV`, defaulting to
`"development"` when neither is set. `@nebula.js/cli-build` defaults Rollup's mode to `"production"`.

Left alone, Babel emits `jsxDEV()` calls while Rollup bundles React's production dev-runtime stub,
where `jsxDEV` is `undefined`. The extension builds, packages and uploads cleanly, then throws
`jsxDEV is not a function` and renders nothing.

**Rule:** `NODE_ENV` is pinned to match `--mode` in both build scripts, and `scripts/post-build.mjs`
fails a production build if `jsxDEV` reaches the bundle.

## 5. A property-panel item materialises the path it binds to

Regardless of any `show` guard. An item bound to
`qHyperCubeDef.qDimensions.0.qAttributeExpressions.N.qExpression` **creates `qDimensions[0]`** when
the panel is built, and Sense renders that fieldless dimension as a red "Invalid dimension" the
instant the object is dropped on a sheet.

**Rule:** panel items bind to `chatbox.attrs.*`, and `src/qix/sync-attrs.js` reconciles them into the
cube once a real dimension exists. A unit test fails the build if any item binds to an absolute
`qHyperCubeDef.` path again.

## 6. A rejected panel section makes the WHOLE panel vanish

Silently, with nothing in the console. Splitting `uses: 'data'` into separate `uses: 'dimensions'`
and `uses: 'measures'` sections — documented classic-API syntax — produced no property panel at all.

**Rule:** `data` stays a single `{ uses: 'data' }` section, asserted by a test. Verify any new
`component` string against a shipped `sn-*` bundle before using it; nebula's own docs contain at
least two wrong ones (`button-group` should be `buttongroup`, and `theme.validateColor` does not
exist).

## 7. `nebula serve` does not render the property panel

It ignores `ext.definition` entirely and introspects raw properties by JavaScript type. Every panel
change needs a full `nebula sense` build and an upload to a real Sense server to be seen.

**Rule:** keep `src/ext/` a pure data structure and unit-test its shape — that is the only feedback
loop that costs less than a deploy.

## 8. Non-unique message ids merge messages silently

A straight hypercube emits one row per distinct combination of dimension values. Two messages
sharing a message id **and** an author collapse into one bubble with no warning. (Sharing only the id
is harmless — the author disambiguates the combination.)

**Rule:** the hidden `Count([MsgId])` integrity probe measure detects it and the extension renders a
warning banner. It is a data-model constraint the extension can detect but never fix.
