import fs from "fs";
import { Express, Request, Response } from "express";
import { Persistence } from "../../core/interfaces/Persistence";
import { AllBooks, Book } from "../../core/models/Lesson";
import { isCompleteQuarter, missingQuarterParts } from "../../core/models/Quarter";
import {
  AssemblyJob,
  AssemblyJobKey,
  AssemblyJobRegistry,
  AssemblyMode,
} from "../assembly/AssemblyJobRegistry";
import { requireSameOrigin } from "../middle/requireSameOrigin";
import assembleQuarter from "../actions/assembleQuarter";
import deriveMajorityLanguageId from "../actions/deriveMajorityLanguageId";

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
 * `requireSameOrigin` (CSRF) gates the state-changing POST route only — the
 * three GET routes are read-only and exempt (contract §1).
 *
 * The completeness gate here is the cheap EXISTENCE-only check
 * (`missingQuarterParts`); the fuller generation-time gate (a constituent
 * that throws during `makeLessonFile`) and the curated failure-reason
 * vocabulary land with US4 (lessons-from-luke-koog.6.5.2/.3). The `mode` →
 * majority-language derivation is delegated to `deriveMajorityLanguageId`
 * (the single source of truth shared with `documentsController.ts`'s
 * per-lesson-download rule) — see that module's doc comment for the full
 * contract.
 */
export interface AssemblyControllerOptions {
  /** In-memory, process-scoped job registry (FR-011). */
  registry: AssemblyJobRegistry;
  /** Dedicated per-job working-dir root (`<docStorage>/assembly-work`). */
  workRoot: string;
}

const VALID_MODES: readonly string[] = ["bilingual", "single-language"];

function isBook(value: string): value is Book {
  return (AllBooks as readonly string[]).includes(value);
}

function isMode(value: unknown): value is AssemblyMode {
  return typeof value === "string" && VALID_MODES.includes(value);
}

/** Parses a route/query param to a finite integer, or `null` if it isn't one. */
function parseIntParam(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const n = Number(raw);
  return Number.isInteger(n) ? n : null;
}

/** Shared `{jobId, status[, reason]}` body shape for both status-poll routes. */
function jobStatusBody(job: AssemblyJob): Record<string, unknown> {
  if (job.status.tag === "failed") {
    return { jobId: job.jobId, status: "failed", reason: job.status.reason };
  }
  return { jobId: job.jobId, status: job.status.tag };
}

/**
 * Builds an ASCII-fallback + RFC 5987 UTF-8 `Content-Disposition` filename
 * pair (contract §4, Pass 2 finding C: mother-tongue names are routinely
 * non-Latin script). CR/LF/quotes are stripped first (Pass 1 finding #10 —
 * header-splitting) so percent-encoding never re-introduces them.
 */
function assembledFilenames(
  languageName: string,
  book: Book,
  series: number,
  mode: AssemblyMode
): { ascii: string; utf8: string } {
  const modeTag = mode === "bilingual" ? "Bilingual" : "SingleLang";
  const cleaned = `${languageName}_${book}-Q${series}-${modeTag}`.replace(/[\r\n"]/g, "");
  const ascii = cleaned.replace(/[^\x20-\x7E]/g, "_") + ".odt";
  const utf8 = encodeURIComponent(cleaned) + ".odt";
  return { ascii, utf8 };
}

/**
 * The real background work for one assembly job: resolve the quarter's full
 * `Lesson`s (with `lessonStrings`) and delegate to `assembleQuarter`. Never
 * invoked directly by the controller tests (the registry is mocked there);
 * this is exercised end-to-end by the golden-reference integration test
 * (lessons-from-luke-koog.6.2.14).
 *
 * The registry generates a job's `jobId` internally and invokes this runner
 * with no arguments (`AssemblyRunner = () => Promise<string>`) — and it may
 * do so *synchronously*, before `startOrAttach` has even returned to the
 * caller. So the jobId can't be captured from `startOrAttach`'s return value;
 * instead the runner looks its own job back up by `key` once it starts
 * (safe — the registry inserts the job into its lookup maps *before* it can
 * ever invoke the runner, per `startOrAttach`'s check-then-insert ordering).
 */
function makeRunner(
  storage: Persistence,
  workRoot: string,
  registry: AssemblyJobRegistry,
  key: AssemblyJobKey
): () => Promise<string> {
  return async () => {
    const job = registry.getByKey(key);
    if (!job) {
      throw new Error("assembly failed (internal)");
    }
    const jobId = job.jobId;

    // Curated, fixed-vocabulary reason ONLY for every storage-layer call
    // below — a `Persistence` implementation failure (e.g. a raw DB driver
    // error) can carry connection details or query text; never forward it
    // verbatim (data-model.md "reason hygiene" — see assembleQuarter.ts's
    // catches for the full contract this mirrors at the runner boundary).
    let motherLang;
    let baseLessons;
    try {
      motherLang = await storage.language({ languageId: key.languageId });
      baseLessons = (await storage.lessons()).filter(
        (lsn) => lsn.book === key.book && lsn.series === key.series
      );
    } catch {
      throw new Error("assembly failed (internal)");
    }
    if (!motherLang) {
      throw new Error("assembly failed (internal)");
    }

    const lessons = [];
    try {
      for (const baseLesson of baseLessons) {
        const fullLesson = await storage.lesson(baseLesson.lessonId);
        if (fullLesson) lessons.push(fullLesson);
      }
    } catch {
      throw new Error("assembly failed (internal)");
    }

    const majorityLangId = deriveMajorityLanguageId(key.mode, motherLang);

    return assembleQuarter({
      storage,
      lessons,
      motherLang,
      majorityLangId,
      jobId,
      workRoot,
    });
  };
}

export default function assemblyController(
  app: Express,
  storage: Persistence,
  options: AssemblyControllerOptions
): void {
  const { registry, workRoot } = options;

  app.post(
    "/api/languages/:languageId/quarters/:book/:series/assembly",
    requireSameOrigin,
    async (req: Request, res: Response): Promise<void> => {
      const languageId = parseIntParam(req.params.languageId);
      const series = parseIntParam(req.params.series);
      const book = req.params.book;
      const mode = (req.body ?? {}).mode as unknown;

      if (languageId === null || series === null) {
        res.status(400).json({ error: "languageId and series must be integers" });
        return;
      }
      if (!isBook(book)) {
        res.status(400).json({ error: "invalid book" });
        return;
      }
      if (!isMode(mode)) {
        res.status(400).json({ error: "invalid mode" });
        return;
      }

      const language = await storage.language({ languageId });
      if (!language) {
        res.status(404).json({ error: "unknown language" });
        return;
      }

      const allLessons = await storage.lessons();
      const quarterLessons = allLessons.filter((lsn) => lsn.book === book && lsn.series === series);
      if (quarterLessons.length === 0) {
        res.status(404).json({ error: "unknown book/series" });
        return;
      }

      if (!isCompleteQuarter(book, series, allLessons)) {
        const missing = missingQuarterParts(book, series, allLessons);
        res.status(409).json({
          status: "failed",
          reason: `missing constituent: ${missing.join(", ")}`,
          missing,
        });
        return;
      }

      const key: AssemblyJobKey = { languageId, book, series, mode };
      const result = registry.startOrAttach(key, makeRunner(storage, workRoot, registry, key));

      if (result.outcome === "rejected") {
        res.status(429).json({ reason: result.reason });
        return;
      }

      res.status(202).json({ jobId: result.job.jobId, status: result.job.status.tag });
    }
  );

  app.get(
    "/api/languages/:languageId/quarters/:book/:series/assembly",
    (req: Request, res: Response): void => {
      const languageId = parseIntParam(req.params.languageId);
      const series = parseIntParam(req.params.series);
      const book = req.params.book;
      const mode = req.query.mode;

      if (languageId === null || series === null || !isBook(book) || !isMode(mode)) {
        res.status(404).json({ error: "no job for this key" });
        return;
      }

      const key: AssemblyJobKey = { languageId, book, series, mode };
      const job = registry.getByKey(key);
      if (!job) {
        res.status(404).json({ error: "no job for this key" });
        return;
      }
      res.status(200).json(jobStatusBody(job));
    }
  );

  app.get("/api/assembly/:jobId/status", (req: Request, res: Response): void => {
    const job = registry.get(req.params.jobId);
    if (!job) {
      res.status(404).json({ error: "unknown or expired job id" });
      return;
    }
    res.status(200).json(jobStatusBody(job));
  });

  app.get("/api/assembly/:jobId/download", async (req: Request, res: Response): Promise<void> => {
    const job = registry.get(req.params.jobId);
    if (!job) {
      res.status(404).json({ error: "unknown or expired job id" });
      return;
    }
    if (job.status.tag !== "ready") {
      res.status(409).json({ error: "job is not ready" });
      return;
    }

    const { resultPath } = job.status;
    if (!fs.existsSync(resultPath)) {
      res.status(404).json({ error: "result has expired" });
      return;
    }

    const language = await storage.language({ languageId: job.key.languageId });
    const languageName = language?.name ?? "assembled";
    const { ascii, utf8 } = assembledFilenames(
      languageName,
      job.key.book,
      job.key.series,
      job.key.mode
    );

    res.status(200);
    res.setHeader("Content-Type", "application/vnd.oasis.opendocument.text");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${ascii}"; filename*=UTF-8''${utf8}`
    );

    const stream = fs.createReadStream(resultPath);
    stream.on("error", () => {
      if (!res.headersSent) {
        res.status(404).json({ error: "result has expired" });
      } else {
        res.end();
      }
    });
    stream.pipe(res);
  });
}
