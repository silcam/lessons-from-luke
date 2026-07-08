import fs from "fs";
import path from "path";

/**
 * Startup sweep of the dedicated assembly-work root
 * (`<docStorage>/assembly-work/`, see {@link ../../server/assembly/sofficeAssemble} and
 * data-model.md "AssemblyJobRegistry (working-dir lifecycle)").
 *
 * Abrupt process death (SIGKILL/OOM, and `custom:restart_passenger`, which
 * fires on every Capistrano deploy) skips the eager `rm -rf` cleanup a
 * finished job normally performs, so `<workRoot>/<jobId>/` dirs can orphan.
 * This sweep is the ONLY cleanup path for those abrupt-death orphans: call it
 * once, on server startup (registry init), before any new job can write under
 * `workRoot`.
 *
 * Safe ONLY under the single-process deployment constraint (see the separate
 * Passenger single-process-pin operational task) — do not call this assuming
 * multi-worker safety, since a second live worker's in-flight job dirs would
 * be swept out from under it.
 */
export function sweepAssemblyWork(workRoot: string): void {
  if (!fs.existsSync(workRoot)) {
    return;
  }
  for (const entry of fs.readdirSync(workRoot)) {
    fs.rmSync(path.join(workRoot, entry), { recursive: true, force: true });
  }
}
