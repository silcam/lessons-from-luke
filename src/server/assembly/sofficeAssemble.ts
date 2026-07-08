import path from "path";

/**
 * sofficeAssemble — productionized wrapper around the spike's three-step
 * `soffice --headless` merge flow (research.md §R1):
 *
 * 1. **Warm** a fresh per-job profile (`soffice --headless --convert-to odt`
 *    on a throwaway file) so LibreOffice builds its `user/basic` library
 *    tree under the profile.
 * 2. **Inject** `macro/Module1.xba` into
 *    `<profile>/user/basic/Standard/Module1.xba` and `rm -f <profile>/.lock`
 *    (the warm step leaves a stale lock file behind).
 * 3. **Run** `soffice --headless --norestore --nologo
 *    -env:UserInstallation=file://<profile>
 *    macro:///Standard.Module1.Assemble`, passing the ordered constituent
 *    file list and output URL via env vars (`SPIKE_FILES` / `SPIKE_OUT_URL`,
 *    matching the spike macro's `Environ()` reads).
 *
 * Process-group kill (plan.md Red-Team Pass 1, "Killing a hung soffice"):
 * `soffice` launches via `oosplash`, which forks `soffice.bin` — a plain
 * PID kill can orphan `soffice.bin`. Every spawned `soffice` process MUST be
 * started detached (its own process group) so a hard-timeout kill can target
 * the whole group (`process.kill(-pid, "SIGKILL")`), never a lone PID.
 *
 * Per-job working-dir root (plan.md Red-Team Pass 3, "Temp-Dir Lifecycle"):
 * the profile is NOT a bare `mktemp -d` — it lives at a deterministic path
 * under a single dedicated root (`<docStorage>/assembly-work/<jobId>/`, see
 * data-model.md "AssemblyJobRegistry (working-dir lifecycle)") so the whole
 * root can be swept on server startup and `rm -rf`'d eagerly on completion.
 *
 * NOT YET IMPLEMENTED — stub for RED task lessons-from-luke-koog.6.1.7; real
 * implementation (+ REFACTOR) lands in lessons-from-luke-koog.6.1.8.
 */

/** Ordered, ASCII-named (`00.odt`..`13.odt`) absolute constituent file paths, and where to write the result. */
export interface SofficeAssembleOptions {
  /** The owning job's id — used to derive a per-job, collision-free profile dir. */
  jobId: string;
  /** Ordered absolute paths of the constituent `.odt` files to merge, TOC first. */
  files: string[];
  /** Absolute path to write the assembled `.odt` to. */
  outputPath: string;
  /**
   * The dedicated, single known root all per-job working dirs live under
   * (`<docStorage>/assembly-work`, NOT a bare `mktemp -d` — see the class doc
   * comment). The per-job profile is `<workRoot>/<jobId>/`.
   */
  workRoot: string;
  /** Hard per-run timeout in ms. Defaults to {@link DEFAULT_TIMEOUT_MS}. */
  timeoutMs?: number;
  /** Override for the `soffice` executable name/path (defaults to `"soffice"`). Test seam. */
  sofficeBin?: string;
}

/** Successful-run result. */
export interface SofficeAssembleResult {
  /** The same `outputPath` the caller supplied, once `soffice` has written it. */
  outputPath: string;
}

/**
 * Hard per-run timeout: ~2.5x the ~40s baseline observed in the spike
 * (research.md §R1), so a merge that is merely slow still completes, while a
 * genuinely hung `soffice` is bounded.
 */
export const DEFAULT_TIMEOUT_MS = 100_000;

/** Fixed-vocabulary error thrown when the hard timeout fires and the process group is killed. */
export class SofficeAssembleTimeoutError extends Error {
  constructor() {
    super("soffice assembly timed out");
    this.name = "SofficeAssembleTimeoutError";
  }
}

/**
 * Derive the per-job profile directory: `<workRoot>/<jobId>/profile`. Kept
 * distinct from the job's other working-dir contents (constituent copies,
 * flattened copies) that a caller layers alongside it under
 * `<workRoot>/<jobId>/`.
 */
export function profileDirFor(workRoot: string, jobId: string): string {
  return path.join(workRoot, jobId, "profile");
}

/**
 * Run the three-step warm/inject/run `soffice` merge flow for one assembly
 * job. See the module doc comment for the full contract this MUST satisfy
 * once implemented (process-group spawn + kill, per-job profile isolation,
 * hard timeout).
 *
 * NOT YET IMPLEMENTED — see module doc comment.
 */
export function sofficeAssemble(_options: SofficeAssembleOptions): Promise<SofficeAssembleResult> {
  throw new Error("not implemented");
}
