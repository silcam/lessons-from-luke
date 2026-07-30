/// <reference types="jest" />

import {
  ASSEMBLY_ABANDON_MS,
  ASSEMBLY_MAX_LIVE_JOBS,
  ASSEMBLY_NON_SOFFICE_BUDGET_MS,
  ASSEMBLY_TIMEOUT_MS,
  ASSEMBLY_TTL_MS,
} from "./assemblyBudget";
import { DEFAULT_TIMEOUT_MS } from "./sofficeAssemble";

describe("assembly budget constants", () => {
  it("keeps the registry timeout strictly after soffice's own self-kill", () => {
    // THE invariant. The registry timeout marks a job `failed` and frees the
    // concurrency-1 slot, but it does NOT kill soffice — only
    // `sofficeAssemble`'s timer does. If the registry could fire first, a
    // queued job would be promoted while the original soffice process was
    // still alive, breaking concurrency-1.
    //
    // Asserted as a relation between the exported symbols, not against the
    // literals: restating the numbers would catch nothing.
    expect(ASSEMBLY_TIMEOUT_MS).toBeGreaterThanOrEqual(
      DEFAULT_TIMEOUT_MS + ASSEMBLY_NON_SOFFICE_BUDGET_MS
    );
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
