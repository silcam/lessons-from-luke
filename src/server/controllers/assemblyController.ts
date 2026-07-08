import { Express, RequestHandler } from "express";
import { Persistence } from "../../core/interfaces/Persistence";
import { AssemblyJobRegistry } from "../assembly/AssemblyJobRegistry";

/**
 * assemblyController — start/status/download endpoints for the assembled
 * quarter-book download feature (US1).
 *
 * Spec: specs/007-assembled-quarter-download/contracts/assembly-api.md §1-4
 *
 * Routes (mirrors the contract exactly):
 *   POST /api/languages/:languageId/quarters/:book/:series/assembly
 *   GET  /api/languages/:languageId/quarters/:book/:series/assembly?mode=
 *   GET  /api/assembly/:jobId/status
 *   GET  /api/assembly/:jobId/download
 *
 * NOT YET IMPLEMENTED — stub for RED task lessons-from-luke-koog.6.2.4; real
 * implementation (+ REFACTOR, including wiring `requireSameOrigin` on the
 * POST route and the registry's startOrAttach/get/getByKey) lands in
 * lessons-from-luke-koog.6.2.10. Every route here responds `501` so the RED
 * controller tests fail on their status/body assertions rather than on a
 * route-not-found/compile error.
 */
export interface AssemblyControllerOptions {
  /** In-memory, process-scoped job registry (FR-011). */
  registry: AssemblyJobRegistry;
  /** Dedicated per-job working-dir root (`<docStorage>/assembly-work`). */
  workRoot: string;
}

export default function assemblyController(
  app: Express,
  _storage: Persistence,
  _options: AssemblyControllerOptions
): void {
  const notImplemented: RequestHandler = (_req, res) => {
    res.status(501).json({ error: "not implemented" });
  };

  app.post("/api/languages/:languageId/quarters/:book/:series/assembly", notImplemented);
  app.get("/api/languages/:languageId/quarters/:book/:series/assembly", notImplemented);
  app.get("/api/assembly/:jobId/status", notImplemented);
  app.get("/api/assembly/:jobId/download", notImplemented);
}
