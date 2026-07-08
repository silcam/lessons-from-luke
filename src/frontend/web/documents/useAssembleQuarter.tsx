import { Book } from "../../../core/models/Lesson";
import { PublicLanguage } from "../../../core/models/Language";

/**
 * Assembly mode for a quarter book — mirrors
 * specs/007-assembled-quarter-download/contracts/assembly-api.md.
 */
export type AssembleMode = "bilingual" | "single-language";

/**
 * Discriminated-union client-side view of an assembly job's lifecycle.
 * Mirrors the server's `queued | running | ready | failed` poll states
 * (contract §2), plus a local `idle` state before the first POST.
 *
 * NOT YET IMPLEMENTED — stub for RED task lessons-from-luke-koog.6.2.11; the
 * GREEN task (lessons-from-luke-koog.6.2.12) wires this hook up for real.
 * `start` currently does nothing so the RED tests fail on their assertions
 * (no POST/GET calls, no state transitions, no download) rather than on a
 * compile/import error.
 */
export type AssembleStatus =
  | { tag: "idle" }
  | { tag: "queued" }
  | { tag: "running" }
  | { tag: "ready" }
  | { tag: "failed"; reason: string };

export interface UseAssembleQuarterResult {
  status: AssembleStatus;
  start: () => void;
}

export default function useAssembleQuarter(
  _language: PublicLanguage,
  _book: Book,
  _series: number,
  _mode: AssembleMode
): UseAssembleQuarterResult {
  return {
    status: { tag: "idle" },
    start: () => {
      /* not yet implemented — see lessons-from-luke-koog.6.2.12 */
    },
  };
}
