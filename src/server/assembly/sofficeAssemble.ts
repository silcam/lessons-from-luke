import path from "path";
import fs from "fs";
import { spawn, type ChildProcess } from "child_process";
import { MODULE1_XBA } from "./macro/module1Xba";

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
 * Inject-step fs prep (warm throwaway file, `user/basic/Standard` mkdir,
 * macro copy, stale `.lock` removal) is best-effort and synchronous: the
 * warm step is what actually builds the profile's `user/basic` tree, so in
 * production these calls succeed once warm has run. Wrapping them in
 * try/catch with a `console.warn` means a prep hiccup doesn't crash the
 * flow — the run step's own non-zero exit (macro not found) is the real,
 * user-visible failure signal. Being synchronous (no `await`) also matters:
 * the warm child's `close` handler must synchronously spawn the run step
 * and attach its `close` listener before yielding, or a caller that fires
 * `close` on a pre-existing event-loop tick can race past an unattached
 * listener.
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
 * Best-effort, synchronous profile prep: warm throwaway file, `user/basic`
 * scaffolding, macro copy, stale `.lock` removal. See module doc comment for
 * why this is deliberately swallow-on-failure and synchronous.
 */
function prepareWarmInput(profileDir: string): string {
  const warmFile = path.join(profileDir, "..", "warm.txt");
  try {
    fs.mkdirSync(path.dirname(warmFile), { recursive: true });
    fs.writeFileSync(warmFile, "warmup");
  } catch (err) {
    console.warn("sofficeAssemble: warm-input prep failed", err);
  }
  return warmFile;
}

function injectMacro(profileDir: string): void {
  try {
    const basicDir = path.join(profileDir, "user", "basic", "Standard");
    fs.mkdirSync(basicDir, { recursive: true });
    // Embedded (module1Xba.ts) rather than copied from a sibling .xba: tsc does
    // not emit non-.ts assets into dist, so a copyFileSync(__dirname/...) ENOENTs
    // in every built layout (dev-flat and prod-nested dist alike).
    fs.writeFileSync(path.join(basicDir, "Module1.xba"), MODULE1_XBA);
    fs.rmSync(path.join(profileDir, ".lock"), { force: true });
  } catch (err) {
    console.warn("sofficeAssemble: macro inject failed", err);
  }
}

/**
 * Run the three-step warm/inject/run `soffice` merge flow for one assembly
 * job. See the module doc comment for the full contract this MUST satisfy
 * once implemented (process-group spawn + kill, per-job profile isolation,
 * hard timeout).
 */
export function sofficeAssemble(options: SofficeAssembleOptions): Promise<SofficeAssembleResult> {
  const {
    jobId,
    files,
    outputPath,
    workRoot,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    sofficeBin = "soffice",
  } = options;

  const profileDir = profileDirFor(workRoot, jobId);
  const env = { ...process.env };

  return new Promise<SofficeAssembleResult>((resolve, reject) => {
    let settled = false;
    let currentChild: ChildProcess | undefined;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      if (currentChild && currentChild.pid) {
        process.kill(-currentChild.pid, "SIGKILL");
      }
      reject(new SofficeAssembleTimeoutError());
    }, timeoutMs);

    function settleResolve(result: SofficeAssembleResult): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    }

    function settleReject(err: Error): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    }

    // Step 3 (run): spawned synchronously from the warm child's `close`
    // handler below, before yielding to the event loop.
    function runStep(): void {
      const runArgs = [
        "--headless",
        "--norestore",
        "--nologo",
        `-env:UserInstallation=file://${profileDir}`,
        "macro:///Standard.Module1.Assemble",
      ];
      const runEnv = {
        ...env,
        SPIKE_FILES: files.join("\n"),
        SPIKE_OUT_URL: `file://${outputPath}`,
      };
      const runChild = spawn(sofficeBin, runArgs, { detached: true, env: runEnv });
      currentChild = runChild;

      runChild.on("error", (err) => settleReject(err));
      runChild.on("close", (code) => {
        if (code === 0) {
          settleResolve({ outputPath });
        } else {
          settleReject(new Error(`soffice run step exited with code ${String(code)}`));
        }
      });
    }

    // Step 1 (warm).
    const warmFile = prepareWarmInput(profileDir);
    const warmArgs = [
      "--headless",
      "--norestore",
      "--nologo",
      `-env:UserInstallation=file://${profileDir}`,
      "--convert-to",
      "odt",
      "--outdir",
      path.join(profileDir, "warm_out"),
      warmFile,
    ];
    const warmChild = spawn(sofficeBin, warmArgs, { detached: true, env });
    currentChild = warmChild;

    warmChild.on("error", (err) => settleReject(err));
    warmChild.on("close", () => {
      if (settled) return;
      // Step 2 (inject) — synchronous fs, then synchronously spawn the run
      // step so its `close` listener is attached before yielding (see
      // module doc comment).
      injectMacro(profileDir);
      runStep();
    });
  });
}
