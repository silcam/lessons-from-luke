/// <reference types="jest" />

import * as assemblyBudget from "./assemblyBudget";
import {
  ASSEMBLY_ABANDON_MS,
  ASSEMBLY_MAX_LIVE_JOBS,
  ASSEMBLY_NON_SOFFICE_BUDGET_MS,
  ASSEMBLY_TIMEOUT_MS,
  ASSEMBLY_TTL_MS,
} from "./assemblyBudget";
import { DEFAULT_TIMEOUT_MS } from "./sofficeAssemble";

/**
 * `ASSEMBLY_RENDER_TIMEOUT_MS` and `ASSEMBLY_EXIT_POLL_CAP_MS` don't exist yet
 * (that's the following GREEN task's job). Reached via a loosely-typed view of
 * the module rather than a named import so the module fails to satisfy these
 * assertions at RUNTIME — an assertion error — instead of failing TypeScript
 * compilation, which would mask whether the derivation itself is wrong.
 */
const untypedBudget = assemblyBudget as unknown as Record<string, number>;

describe("assembly budget constants", () => {
  it("keeps the registry timeout strictly after all three soffice invocations have self-killed (merge + 2 renders)", () => {
    // THE invariant. The registry timeout marks a job `failed` and frees the
    // concurrency-1 slot, but it does NOT kill soffice — only
    // `sofficeAssemble`'s timer (for the merge) and the render's own timer
    // (for each render) do. If the registry could fire first, a queued job
    // would be promoted while an original soffice process group was still
    // alive, breaking concurrency-1.
    //
    // A job now runs up to THREE soffice invocations: the merge, and up to
    // two renders (production + mandatory confirmation render). The factor
    // of 2 on the render timeout and 3 on the exit-poll cap (there are up to
    // three bounded exit-polls per job: before render 1, before the
    // re-finalize, before the confirmation render) are the worst case and are
    // carried UNCONDITIONALLY, not derived from any runtime branch, so this
    // invariant stays structural rather than conditional.
    //
    // Asserted as a relation between the exported symbols, not against the
    // literals: restating the numbers would catch nothing.
    expect(ASSEMBLY_TIMEOUT_MS).toBeGreaterThanOrEqual(
      DEFAULT_TIMEOUT_MS +
        2 * untypedBudget["ASSEMBLY_RENDER_TIMEOUT_MS"] +
        3 * untypedBudget["ASSEMBLY_EXIT_POLL_CAP_MS"] +
        ASSEMBLY_NON_SOFFICE_BUDGET_MS
    );
  });

  it("defines ASSEMBLY_RENDER_TIMEOUT_MS: each render's own self-kill budget", () => {
    expect(typeof untypedBudget["ASSEMBLY_RENDER_TIMEOUT_MS"]).toBe("number");
    expect(untypedBudget["ASSEMBLY_RENDER_TIMEOUT_MS"]).toBeGreaterThan(0);
  });

  it("defines ASSEMBLY_EXIT_POLL_CAP_MS: the bounded exit-poll's cap", () => {
    expect(typeof untypedBudget["ASSEMBLY_EXIT_POLL_CAP_MS"]).toBe("number");
    expect(untypedBudget["ASSEMBLY_EXIT_POLL_CAP_MS"]).toBeGreaterThan(0);
  });

  it("budgets enough time for the non-soffice work on the deployed box", () => {
    // Measured on an M3 against real fixtures (Luke series 2): 2,672ms for
    // 14x copy + prepareConstituentForAssembly, 381ms for
    // finalizeAssembledQuarter, and ~1,450ms as a lower bound on 14x
    // makeLessonFile — call it ~9s all told. The deployed 2-vCPU Lightsail
    // box is roughly 2.5-3.5x slower on single-thread work, so ~21-27s.
    expect(ASSEMBLY_NON_SOFFICE_BUDGET_MS).toBeGreaterThanOrEqual(60_000);
  });

  it("only force-releases an abandoned slot strictly after the registry timeout", () => {
    // The slot is held until the runner settles; the abandon hatch exists
    // only for a runner stuck in an unbounded DB await. Firing it at or
    // before the registry timeout would defeat the point of holding the slot
    // at all — a timed-out job would free its slot immediately again.
    expect(ASSEMBLY_ABANDON_MS).toBeGreaterThan(ASSEMBLY_TIMEOUT_MS);
  });

  it("keeps the live-job cap and terminal TTL positive", () => {
    expect(ASSEMBLY_MAX_LIVE_JOBS).toBeGreaterThan(0);
    expect(ASSEMBLY_TTL_MS).toBeGreaterThan(0);
  });
});
