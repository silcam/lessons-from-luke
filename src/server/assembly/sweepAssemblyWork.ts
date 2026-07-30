import fs from "fs";
import path from "path";
import { reapOrphanedSoffice } from "./reapOrphanedSoffice";

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
 * Orphaned PROCESSES are reaped first (`reapOrphanedSoffice`), before the
 * `rm -rf` below. `soffice` is spawned detached, so it survives the restart
 * that stranded its dir — and deleting a live LibreOffice's profile tree out
 * from under it is its own hazard, on top of leaving a second merge running
 * against the fresh registry's free concurrency-1 slot.
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
  reapOrphanedSoffice(workRoot);
  for (const entry of fs.readdirSync(workRoot)) {
    fs.rmSync(path.join(workRoot, entry), { recursive: true, force: true });
  }
}
