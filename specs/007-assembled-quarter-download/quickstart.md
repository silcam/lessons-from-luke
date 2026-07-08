# Quickstart: Assembled Quarter Download

How to exercise and verify this feature during development. Assumes the standard dev setup (see root `CLAUDE.md` — three isolated environments; LibreOffice `soffice` on `PATH`).

## Prerequisites

- `soffice` (LibreOffice) on `PATH` — same dependency `webifyLesson` already uses. Verify: `soffice --version`.
- A **complete** quarter available in the active environment's ODT root. Series **1 is incomplete** (missing Luke 1-6); use **series 2** (Luke 2-14..2-26 + `-99` TOC) for the happy path. The 14 English masters for series 2 live in `test/docs/serverDocs/`.
  - For dev-env runs, the masters must be under `docs/dev/` (`seed-dev-docs` currently only seeds Luke-1 lessons 01–05 — extend as needed for a full-quarter dev run).
- **macOS note**: LO's bundled Python is unusable locally; the assembly driver is the injected **StarBasic macro** (works on macOS dev + Linux prod). Run integration tests **foreground/attached** (a detached soffice hangs in the macOS GUI loop) and with **LibreOffice Writer closed**.

## Manual end-to-end (web dev)

1. `yarn dev-web`, sign in as an operator, open a Language, scroll to its quarter.
2. Click **Assemble quarter → Bilingual** (or **Single-Language**).
3. Observe the indeterminate **"Assembling…"** indicator (queued → running). The control never freezes.
4. On completion the assembled `.odt` downloads automatically (or via a **Download** affordance).
5. Open the file in LibreOffice Writer and confirm:
   - TOC first, then lessons in order.
   - **Editable** — no protected sections, no "update links?" prompt (FR-002).
   - **Continuous page numbers**; each lesson's first page shows no number (FR-003).
   - Footer shows `Quarter N Lesson M …` — **not** blank (FR-004, field-flatten worked).
6. **Incomplete-quarter check (US4)**: trigger assembly on **series 1** → no file, message naming the missing lesson(s).
7. **Dedup check (US3-3)**: double-click assemble → second request attaches to the running job (no duplicate work).

## Automated verification

- **Unit (TDD, fast, no soffice)** — `npx jest src/server/actions/assembleQuarter.test.ts src/server/assembly/AssemblyJobRegistry.test.ts src/server/actions/flattenFooterFields.test.ts --runInBand`
  Covers: quarter lesson-set resolution + ordering, completeness/block logic (soffice mocked), footer field-flatten against a fixture, registry dedup + lifecycle + concurrency-1 + timeout→failed.
- **Integration (real soffice, opt-in, serialized)** — `yarn test:integration` (runs `assembleQuarter.integration.test.ts`).
  Asserts on the produced `.odt`: 0 `text:protected`, 0 linked `.odt`, 0 `text:section-source`; image-reference count preserved; footer fields resolved to literal text; page count matches the with-`PAGE_BEFORE` expectation. Mirrors the spike's `verify.sh` checks. **Close LibreOffice first.**
- **E2E (Cypress)** — `cypress/integration/assembleQuarter.cy.ts`: start → "Assembling…" → download for a complete quarter; blocked message for an incomplete one.

## Spike reference (proven mechanism)

The invocation to productionize lives in `spike/`:

- `spike/assemble.sh` — warm-profile → inject macro → run `macro:///Standard.Module1.Assemble`.
- `spike/macro-template/basic/Standard/Module1.xba` — the `Assemble` macro (`insertDocumentFromURL` + `PAGE_BEFORE` breaks + `storeToURL writer8`).
- `spike/verify.sh` — the objective link/protection/image/page checks to port into the integration test.
- `spike/FINDINGS.md` — the documented gaps. The **+1 page-number offset** is **matched, not fixed** (Chris's reference `.odt` carries the identical offset — research.md R3); the one gap to close in implementation is the **footer field-flatten** (research.md R4).

## Known gotchas (from spike caveats)

- Serialize soffice (concurrency 1) — a second simultaneous instance hangs.
- Always use a per-job isolated `-env:UserInstallation` profile; `rm -f <profile>/.lock` after warmup; `rm -rf` the profile on completion/crash.
- Hard timeout + kill: a hung soffice sits at 0 % CPU forever.
- ODF re-zip (field-flatten) requires **mimetype stored first, uncompressed** — do not blindly reuse `fsUtils.zip`'s `zip -r`.
