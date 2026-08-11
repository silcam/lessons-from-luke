# Quickstart: Quarter Pagination and Coloring-Page Style Fixes (017)

How to run the spike, verify the fixes, and know when the feature is done.

## Prerequisites

```bash
nvm use                 # Node 24 (.nvmrc)
yarn install
yarn migrate:test
soffice --version       # LibreOffice — required for every check below
pdftotext -v            # poppler — page text extraction
pdfinfo -v              # poppler — page count
```

LibreOffice on macOS is effectively single-instance: **close any running LibreOffice before
running a headless merge**, or the headless process hangs. (Planning hit exactly this.)

---

## 1. The headless discriminating check (run this first — research R2)

Settles whether `insertDocumentFromURL` collides or renames automatic styles. No PDF, no
human, ~20 s. Merge two fixture lessons whose automatic style names collide with opposite
meanings — `Luke-1-05v03.odt` (its `P5` anchors a graphic) then `Luke-1-04v03.odt` (its `P5`
is the second memory verse) — using the 007 spike harness:

```bash
# adapt specs/007-assembled-quarter-download/spike/assemble.sh to take an explicit
# file list; or drive Module1.xba directly with SPIKE_FILES / SPIKE_OUT_URL.
unzip -p out.odt content.xml | python3 -c '...'   # inspect P5's definition and referrers
```

Read the merged `content.xml`:

- `P5` defined **once**, as the graphic anchor, still referenced by lesson 04's verse
  paragraph → **collision confirmed**; the defect reproduces in a 2-constituent merge and
  the fix direction is per-constituent automatic-style namespacing (research R2, direction
  (a)).
- lesson 04's automatic styles **renamed** on insert → hypothesis dead; widen the spike to
  the template `loadStylesFromURL` overwrite pass (013) and, monolingual-only,
  `restyleMonolingualParagraphs`.

Record the result in `specs/017-quarter-pagination-fixes/spike/FINDINGS.md`.

## 2. Static asset checks (seconds, no LibreOffice)

```bash
# no page-number offsets survive anywhere
for f in assets/quarter-styles-template.odt assets/quarter-styles-template-monolingual.odt; do
  unzip -p "$f" styles.xml | grep -c 'text:page-adjust'   # must print 0 after the fix
done
```

## 3. The pagination diagnostic batch (one human sitting)

Built with **first-page suppression disabled**, so every physical page prints its field
value and the exact page where drift begins is visible. Ship all variants in one batch:

| Variant                                            | Purpose                                                     |
| -------------------------------------------------- | ----------------------------------------------------------- |
| baseline, as-is                                    | reproduce the delivered defect                              |
| offsets zeroed                                     | isolate the offsets' contribution                           |
| offsets zeroed + arabic restart pinned at lesson 1 | **the proposed fix** — a clean result doubles as validation |

Each variant in **both** modes (bilingual and monolingual — the assets are not structurally
parallel, research R5), plus **one individually downloaded lesson containing a coloring
page** so the R2 check is corroborated end-to-end in the same sitting.

While the human has the document open, also settle research R4: export the same `.odt` both
ways — `soffice --headless --convert-to pdf` and File → Export as PDF — and compare page
count and per-page footer tokens. If they agree, every later verification round runs
headless.

## 4. Automated verification

```bash
NODE_ENV=test npx jest src/server/actions/assembleQuarter.integration.test.ts --runInBand
NODE_ENV=test npx jest src/server/actions/finalizeAssembledQuarter.test.ts --runInBand
NODE_ENV=test npx jest src/server/assembly/quarterStylesTemplate.test.ts --runInBand
yarn typecheck && yarn lint
```

The integration test is the golden reference. New assertions it must carry (FR-016), in
**both** modes:

- physical page 2 prints `ii`;
- the page after lesson 1's first page prints `2`;
- the last page prints its position in the body sequence;
- no `text:page-adjust` anywhere in the assembled book;
- lesson 1's first page falls at an **odd** physical index;
- on a coloring page, both memory-verse paragraphs resolve to the memory-verse style;
- the coloring page's paragraph count is unchanged (FR-014).

Absolute values — the existing "adjacent numbered pages increment by 1" assertion passes
under a uniformly shifted sequence, which is exactly the delivered defect.

## 5. Manual end-to-end

```bash
yarn dev-web
# → assemble a quarter from the UI, download, open in LibreOffice, read the footers
```

## Done when

- SC-001..SC-007 hold in both modes, verified on a rendered PDF;
- the client confirms both reported defects are resolved on the next delivered quarter
  (SC-008);
- `specs/017-quarter-pagination-fixes/spike/FINDINGS.md` records the answers to all five
  open questions listed at the end of `research.md`.
