/**
 * Splits a single unsplit `<book words> <chapter:verse range>` text run
 * (under a reference-bearing style) into a book-name run + `<text:s/>` + a
 * numeric run, matching the structure the parser already emits for the
 * majority of references (spec.md FR-006..FR-009; research.md Decision 3).
 * Leaves already-split and out-of-scope (>2-run) paragraphs unchanged.
 *
 * NOT YET IMPLEMENTED — this is the RED-stage stub for US3
 * (lessons-from-luke-2v47.5.5.1). It throws so the module compiles (and the
 * pre-commit type-check passes) while `referenceSplitter.test.ts` fails at
 * runtime, not a compile error. The Green task implements the real split.
 */
export function splitUnsplitReferences(_contentXml: string): string {
  throw new Error("not implemented");
}

/**
 * Re-processes a master `.odt` document: unzips it, runs
 * `splitUnsplitReferences` over its `content.xml`, and re-zips to
 * `outDocPath` atomically — via the existing `zip()` temp-file + rename
 * convention in `fsUtils` (see `mergeXml`'s use of the same helper) — so no
 * partially-written master is ever observable at `outDocPath`, even if the
 * rename step is interrupted (spec.md FR-009; plan.md Decision 3).
 *
 * NOT YET IMPLEMENTED — this is the RED-stage stub for US3
 * (lessons-from-luke-2v47.5.5.2). It throws so the module compiles while
 * `referenceSplitter.test.ts`'s atomicity test fails at runtime, not a
 * compile error. The Green task (5.5.3) implements the real
 * extract -> split -> atomic re-zip pipeline and wires it into the upload
 * path.
 */
export function splitReferencesInDocument(_inDocPath: string, _outDocPath: string): void {
  throw new Error("not implemented");
}
