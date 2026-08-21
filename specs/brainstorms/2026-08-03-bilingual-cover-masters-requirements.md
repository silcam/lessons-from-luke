---
date: 2026-08-03
topic: bilingual-cover-masters
---

# Bilingual Cover Masters & Dual-Mode Cover Downloads (008 follow-up)

## Problem Frame

Feature 008 (covers-in-platform) was planned and built against English cover
masters that were **mislabeled as bilingual but were actually monolingual**.
Planning therefore concluded that all cover strings are mother-tongue-only and
that a "bilingual" cover download has no majority-language paragraphs.

The curriculum owner's real bilingual masters (e.g.
`English-Luke-Q1-Cover-A4-bilingual.odt`) contradict this: they carry dedicated
source-language paragraphs — a source-language title under the M.T. title
(paragraph style `English translation - Cover Title`) and a source-language
subtitle under the M.T. "Teacher's Guide" (`English translation - Cover
subtitle`). Because `parse.ts` does not recognize these styles as paired
majority-language strings, bilingual cover downloads today produce an empty
paragraph where the source-language subtitle should be, and the leftover empty
paragraph in the fixed-height, bottom-anchored title cell pushes the title
mostly out of view (reviewer-reported defects, 2026-08).

**Master-file analysis (verified 2026-08-03 against the owner's A4 Q1 pair):**
`styles.xml` is byte-identical between the bilingual and monolingual variants;
the bilingual `content.xml` is the monolingual one **plus exactly two
paragraphs** (source-language title and subtitle). The curriculum owner
confirms: "The monolingual version is the bilingual version saved without the
repetitions." This is exactly the derivation the lesson pipeline already
performs (`singleLanguageize` + `clearEmptyParagraphs`).

## Requirements

**Upload model**

- R1. Operators upload **only the bilingual cover master** per (quarter,
  format) — still two files per quarter (A4 + A3). No separate monolingual
  upload exists; monolingual output is always derived.
- R2. Upload filename recognition MUST handle the owner's new naming, which
  appends a variant suffix (e.g. `English-Luke-Q1-Cover-A4-bilingual.odt`),
  continuing to auto-detect book, series (Q/T prefix), and cover format.

**Extraction & pairing**

- R3. Cover parsing MUST recognize the bilingual masters' source-language
  paragraph styles (`English translation - Cover Title`, `English translation -
Cover subtitle`) as **majority-language strings paired with the M.T.
  paragraph above them**, with identical semantics to lesson M.T./majority
  pairs. (This partially reverses 008's "all cover strings are
  mother-tongue-only" classification — it stands for copyright/address fields,
  not for the title/subtitle pairs.)

**Download**

- R4. Covers MUST offer **both** Bilingual and Single-Language downloads from
  the language page, matching the two-button presentation lessons already have
  (closes the existing covers-render-one-button UI gap; 008 FR-008).
- R5. Bilingual cover output MUST show the source-language title and subtitle
  populated (not empty) in their designated paragraphs, laid out as in the
  owner's bilingual master — no clipped/hidden title.
- R6. Monolingual cover output MUST be the bilingual output with the
  source-language repetition paragraphs removed entirely (no leftover empty
  paragraphs inside the cover's table cells), visually matching the owner's
  monolingual reference file.
- R7. Downloaded cover filenames MUST distinguish the modes with a suffix on
  **both** variants: `<Language>_Luke-Q1-Cover-A4-bilingual.odt` and
  `<Language>_Luke-Q1-Cover-A4-monolingual.odt` (mirrors the master naming;
  both files can coexist in the print-handoff folder).

## Success Criteria

- The reviewer's two reported defects are gone: a bilingual download for a real
  language (e.g. Hausa) shows the translated title fully visible with the
  source-language title beneath it, and the source-language "Teacher's guide"
  appears under the translated subtitle instead of an empty paragraph.
- A monolingual download of the same cover contains no source-language
  repetitions and no stray empty paragraphs, and matches the owner's
  monolingual reference master apart from translated text.
- Operators still upload exactly two cover files per quarter.

## Scope Boundaries

- No separate monolingual upload path or "derive when absent" override.
- No change to A4/A3 modeling (reserved lessons 97/98), assembly isolation
  (covers stay out of assembled quarters), or completeness rules.
- Copyright/address fields remain mother-tongue-only, per 008's verified
  classification.
- No PDF export (unchanged from 008 scope).

## Key Decisions

- **Bilingual master is the single source of truth; monolingual is derived**:
  matches the pipeline's native model for lessons, matches the owner's own
  practice ("saved without the repetitions"), and the master diff proves the
  variants differ only by the two repetition paragraphs. Deriving bilingual
  from monolingual is impossible (would require synthesizing paragraphs and
  styles), so the bilingual file must be canonical.
- **Mode suffix on both download filenames**: both variants get produced and
  handed to print; identical names would clobber each other.
- **Treat 008's mother-tongue-only conclusion as data error, not design
  error**: it was derived from mislabeled monolingual examples; only the
  title/subtitle pairing changes.

## Dependencies / Assumptions

- Continues on the `008-covers-in-platform` branch/feature (this is a
  correction to mid-flight 008 work, stacked per repo convention).
- The owner's new bilingual masters are the canonical uploads; they are already
  uploaded to the dev server. Production/prior uploads of the mislabeled
  masters are superseded by re-uploading (existing document-versioning path);
  no data migration.
- Assumes A3 bilingual masters share the same structure as the verified A4
  pair (two repetition paragraphs, identical styles.xml) — spot-check during
  planning.

## Outstanding Questions

### Resolve Before Specify

- (none)

### Deferred to Planning

- [Affects R3/R6][Technical] The bilingual master's subtitle pair differs in
  case ("Teacher's Guide" vs "Teacher's guide"), so content-dedup yields
  **different master IDs** for the M.T. string and its source-language
  sibling. Verify how `singleLanguageize`'s suppress-queue and bilingual
  pairing behave with non-identical pair text, and adjust pairing if needed.
- [Affects R6][Technical] Confirm the empty-paragraph table guard (015)
  removes the repetition paragraphs cleanly inside the cover's table cells
  (each cell retains its M.T. paragraph, so removal should be permitted).
- [Affects R5][Needs research] Root-cause the clipped-title symptom against
  the real masters (leftover empty paragraph vs. style/height interaction)
  and add a regression check comparing derived monolingual output to the
  owner's monolingual reference file.
- [Affects R2][Technical] Whether upload should warn/reject a
  `-monolingual`-suffixed file (operator uploading the wrong variant), or
  silently accept it as a cover.

## Next Steps

→ `/sp:02-specify` bilingual-cover-masters (008 follow-up), referencing this
document; specify should decide whether this amends `specs/008-covers-in-platform/spec.md`
in place or spins a stacked follow-up feature.
