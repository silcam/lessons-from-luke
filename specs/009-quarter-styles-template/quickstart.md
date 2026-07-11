# Quickstart: Automated Quarter-Styles Template Application (009)

## What this feature does

Every assembled quarter book download arrives already styled with the quarter
styles template — the `M.T.*` mother-tongue highlight removed — so the
publishing operator does zero manual Load Styles / highlight-off work before
visual QA. Backend-only; no UI change.

## Where the change lives

```
assets/quarter-styles-template.odt          # the shipped, swappable style asset
src/server/assembly/quarterStylesTemplate.ts # resolve + validate the asset path
src/server/assembly/macro/Module1.xba        # + loadStylesFromURL before storeToURL
src/server/assembly/sofficeAssemble.ts       # passes SPIKE_TEMPLATE_URL to the macro
src/server/actions/assembleQuarter.ts        # per-job asset validation (fail loudly)
```

## Verify it locally (integration — real soffice)

`soffice`, `pdftotext`, and `pdfinfo` must be on PATH. Note: `soffice` and the
integration jest suite need the Bash sandbox disabled (project memory:
`project_soffice_sandbox_hang`).

```bash
# Runs the golden-reference assembly against the series-2 masters and asserts
# the M.T. highlight-off + all 007 parity axes.
yarn test:integration src/server/actions/assembleQuarter.integration.test.ts
```

Manual spot-check of a produced book:

```bash
# From an assembled.odt, confirm the M.T. body paragraph style has no highlight:
unzip -p assembled.odt styles.xml \
  | grep -oE '<style:style [^>]*style:name="M.T._20_Text"[^>]*>.*?</style:style>' \
  | grep -c 'fo:background-color="#ffffcc"'    # expect 0
```

## Swap in Chris's real template (no code change — FR-005)

```bash
# Replace the asset file; the next assembly uses the new styles.
cp /path/to/chris-real-quarter-styles.odt assets/quarter-styles-template.odt
```

No rebuild of application code is required — the asset is read per job at
runtime from `process.cwd()/assets/`.

## Failure behavior (FR-004)

If `assets/quarter-styles-template.odt` is missing, empty, or unreadable — or the
style load errors mid-assembly — the job ends `failed` with a human-readable
reason (`"quarter styles template asset is missing or unreadable"` for the
common case) and **no** document is offered for download. An unstyled book is
never delivered as print-ready.

## Key design references

- `research.md` — R1–R5 (macro placement, load flags, stand-in form, asset
  location/validation, macro error trap).
- `contracts/template-application.md` — the internal pipeline contract.
- Scope note (research R3 / plan Acceptance Test Strategy): the M.T. highlight
  guarantee is scoped to the **body paragraph** family; two cover paragraph
  styles + one `text`-family highlight retain the reference's own `#ffffcc` and
  are Chris's call to change in his real template.
