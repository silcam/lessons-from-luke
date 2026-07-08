/// <reference types="jest" />

/**
 * Controller tests for the assembled-quarter-download endpoints (US1).
 *
 * Spec: specs/007-assembled-quarter-download/contracts/assembly-api.md §1-4
 *
 * RED: `assemblyController` is a `501`-everywhere stub (see the module doc
 * comment on assemblyController.ts); it is NOT YET registered in
 * `serverApp.ts` (that wiring lands with the GREEN task,
 * lessons-from-luke-koog.6.2.10). These tests build their own isolated
 * Express app and pass in a mocked `Persistence` and a mocked
 * `AssemblyJobRegistry` (per the task's "registry/action mocked" scope), so
 * every assertion below documents the FINAL intended contract and fails
 * against the current stub for the right reason (wrong status/body — not a
 * compile error, not a crash).
 */

import fs from "fs";
import express, { Express } from "express";
import request from "supertest";
import assemblyController from "./assemblyController";
import { Persistence } from "../../core/interfaces/Persistence";
import { Language, ENGLISH_ID } from "../../core/models/Language";
import { BaseLesson, TOC_LESSON } from "../../core/models/Lesson";
import { AssemblyJobRegistry, AssemblyJob } from "../assembly/AssemblyJobRegistry";

const LANGUAGE_ID = ENGLISH_ID;
const BOOK = "Luke";
const SERIES = 1;
const BASE_PATH = `/api/languages/${LANGUAGE_ID}/quarters/${BOOK}/${SERIES}/assembly`;

const motherLang: Language = {
  languageId: ENGLISH_ID,
  name: "English",
  code: "en",
  motherTongue: true,
  progress: [],
  defaultSrcLang: 0,
};

/** All 14 constituents present (TOC + lessons 1..13) — a COMPLETE quarter. */
function completeQuarterLessons(): BaseLesson[] {
  const lessons: BaseLesson[] = [];
  for (let lsn = 1; lsn <= 13; lsn++) {
    lessons.push({ lessonId: lsn, book: BOOK, series: SERIES, lesson: lsn, version: 1 });
  }
  lessons.push({ lessonId: 99, book: BOOK, series: SERIES, lesson: TOC_LESSON, version: 1 });
  return lessons;
}

/** Missing lesson 6 — the real incomplete fixture per data-model.md. */
function incompleteQuarterLessons(): BaseLesson[] {
  return completeQuarterLessons().filter((lsn) => lsn.lesson !== 6);
}

function makeStorage(overrides: Partial<Persistence> = {}): Persistence {
  return {
    language: jest.fn(async () => motherLang),
    lessons: jest.fn(async () => completeQuarterLessons()),
    ...overrides,
  } as unknown as Persistence;
}

function makeJob(overrides: Partial<AssemblyJob> = {}): AssemblyJob {
  return {
    jobId: "job-1",
    key: { languageId: LANGUAGE_ID, book: BOOK, series: SERIES, mode: "bilingual" },
    status: { tag: "queued" },
    createdAt: Date.now(),
    ...overrides,
  };
}

function makeRegistry(overrides: Partial<AssemblyJobRegistry> = {}): AssemblyJobRegistry {
  return {
    startOrAttach: jest.fn(),
    get: jest.fn(),
    getByKey: jest.fn(),
    ...overrides,
  } as unknown as AssemblyJobRegistry;
}

function buildApp(storage: Persistence, registry: AssemblyJobRegistry): Express {
  const app = express();
  // Cast needed: @types/express body-parser types disagree with @types/node@20
  // ServerResponse, same as the existing formDataParser cast in documentsController.ts.
  app.use(express.json() as any);
  assemblyController(app, storage, { registry, workRoot: "/tmp/assembly-work-test" });
  return app;
}

describe("POST .../assembly (start or attach)", () => {
  it("202: starts a new job — {jobId, status: queued|running}", async () => {
    const registry = makeRegistry({
      startOrAttach: jest.fn().mockReturnValue({ outcome: "started", job: makeJob() }),
    });
    const app = buildApp(makeStorage(), registry);

    const res = await request(app).post(BASE_PATH).send({ mode: "bilingual" });

    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ jobId: "job-1" });
    expect(["queued", "running"]).toContain(res.body.status);
  });

  it("202: attaches to an existing live job with the same body shape", async () => {
    const registry = makeRegistry({
      startOrAttach: jest
        .fn()
        .mockReturnValue({ outcome: "attached", job: makeJob({ status: { tag: "running" } }) }),
    });
    const app = buildApp(makeStorage(), registry);

    const res = await request(app).post(BASE_PATH).send({ mode: "bilingual" });

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ jobId: "job-1", status: "running" });
  });

  it("409 or 422: incomplete quarter — {status:'failed', reason, missing}", async () => {
    const storage = makeStorage({ lessons: jest.fn(async () => incompleteQuarterLessons()) });
    const registry = makeRegistry();
    const app = buildApp(storage, registry);

    const res = await request(app).post(BASE_PATH).send({ mode: "bilingual" });

    expect([409, 422]).toContain(res.status);
    expect(res.body.status).toBe("failed");
    expect(typeof res.body.reason).toBe("string");
    expect(res.body.reason.length).toBeGreaterThan(0);
    expect(Array.isArray(res.body.missing)).toBe(true);
    // reason must never leak raw internals
    expect(res.body.reason).not.toMatch(/Error:|soffice|\/Users\/|\/home\//);
    // registry must never be touched for a request that never starts work
    expect(registry.startOrAttach).not.toHaveBeenCalled();
  });

  it("429: at the queue-depth cap — {reason} with NO jobId and NO status:'failed'", async () => {
    const registry = makeRegistry({
      startOrAttach: jest
        .fn()
        .mockReturnValue({ outcome: "rejected", reason: "server busy, retry shortly" }),
    });
    const app = buildApp(makeStorage(), registry);

    const res = await request(app).post(BASE_PATH).send({ mode: "bilingual" });

    expect(res.status).toBe(429);
    expect(res.body.jobId).toBeUndefined();
    expect(res.body.status).not.toBe("failed");
    expect(typeof res.body.reason).toBe("string");
  });

  it("429 is never returned for an attach, even when the registry is saturated", async () => {
    // Dedup-check runs before cap-check: an attach must succeed regardless.
    const registry = makeRegistry({
      startOrAttach: jest
        .fn()
        .mockReturnValue({ outcome: "attached", job: makeJob({ status: { tag: "running" } }) }),
    });
    const app = buildApp(makeStorage(), registry);

    const res = await request(app).post(BASE_PATH).send({ mode: "bilingual" });

    expect(res.status).toBe(202);
  });

  it("403: rejected by requireSameOrigin when Origin/Referer fails the allow-list", async () => {
    const savedEnforce = process.env.BETTER_AUTH_ENFORCE_ORIGIN;
    const savedUrl = process.env.BETTER_AUTH_URL;
    process.env.BETTER_AUTH_ENFORCE_ORIGIN = "1";
    process.env.BETTER_AUTH_URL = "http://localhost:8081";

    try {
      const registry = makeRegistry({
        startOrAttach: jest.fn().mockReturnValue({ outcome: "started", job: makeJob() }),
      });
      const app = buildApp(makeStorage(), registry);

      const res = await request(app)
        .post(BASE_PATH)
        .set("Origin", "https://attacker.example.com")
        .send({ mode: "bilingual" });

      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: "Forbidden" });
    } finally {
      process.env.BETTER_AUTH_ENFORCE_ORIGIN = savedEnforce;
      process.env.BETTER_AUTH_URL = savedUrl;
    }
  });

  it("404: unknown language", async () => {
    const storage = makeStorage({ language: jest.fn(async () => null) });
    const app = buildApp(storage, makeRegistry());

    const res = await request(app).post(BASE_PATH).send({ mode: "bilingual" });

    expect(res.status).toBe(404);
  });

  it("404: unknown book/series (no matching lessons at all)", async () => {
    const storage = makeStorage({ lessons: jest.fn(async () => []) });
    const app = buildApp(storage, makeRegistry());

    const res = await request(app)
      .post(`/api/languages/${LANGUAGE_ID}/quarters/Luke/999/assembly`)
      .send({ mode: "bilingual" });

    expect(res.status).toBe(404);
  });

  it("400: invalid mode", async () => {
    const app = buildApp(makeStorage(), makeRegistry());

    const res = await request(app).post(BASE_PATH).send({ mode: "not-a-real-mode" });

    expect(res.status).toBe(400);
  });

  it("400: invalid :book (not validated against the URL, checked against the Book union)", async () => {
    const app = buildApp(makeStorage(), makeRegistry());

    const res = await request(app)
      .post(`/api/languages/${LANGUAGE_ID}/quarters/NotABook/${SERIES}/assembly`)
      .send({ mode: "bilingual" });

    expect(res.status).toBe(400);
  });

  it("400: non-numeric :series is rejected, not silently treated as 'missing everything'", async () => {
    const app = buildApp(makeStorage(), makeRegistry());

    const res = await request(app)
      .post(`/api/languages/${LANGUAGE_ID}/quarters/${BOOK}/not-a-number/assembly`)
      .send({ mode: "bilingual" });

    expect(res.status).toBe(400);
  });

  it("400: non-numeric :languageId is rejected", async () => {
    const app = buildApp(makeStorage(), makeRegistry());

    const res = await request(app)
      .post(`/api/languages/not-a-number/quarters/${BOOK}/${SERIES}/assembly`)
      .send({ mode: "bilingual" });

    expect(res.status).toBe(400);
  });
});

describe("GET .../assembly?mode= (poll by quarter+mode)", () => {
  it("200: {jobId, status: queued|running}", async () => {
    const registry = makeRegistry({
      getByKey: jest.fn().mockReturnValue(makeJob({ status: { tag: "running" } })),
    });
    const app = buildApp(makeStorage(), registry);

    const res = await request(app).get(`${BASE_PATH}?mode=bilingual`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ jobId: "job-1", status: "running" });
  });

  it("200: {jobId, status: 'ready'}", async () => {
    const registry = makeRegistry({
      getByKey: jest
        .fn()
        .mockReturnValue(makeJob({ status: { tag: "ready", resultPath: "/tmp/x.odt" } })),
    });
    const app = buildApp(makeStorage(), registry);

    const res = await request(app).get(`${BASE_PATH}?mode=bilingual`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ jobId: "job-1", status: "ready" });
  });

  it("200: {jobId, status:'failed', reason, missing?}", async () => {
    const registry = makeRegistry({
      getByKey: jest.fn().mockReturnValue(
        makeJob({
          status: { tag: "failed", reason: "missing constituent: Luke Q1 L6" },
        })
      ),
    });
    const app = buildApp(makeStorage(), registry);

    const res = await request(app).get(`${BASE_PATH}?mode=bilingual`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      jobId: "job-1",
      status: "failed",
      reason: "missing constituent: Luke Q1 L6",
    });
  });

  it("404: no job for this key", async () => {
    const registry = makeRegistry({ getByKey: jest.fn().mockReturnValue(undefined) });
    const app = buildApp(makeStorage(), registry);

    const res = await request(app).get(`${BASE_PATH}?mode=bilingual`);

    expect(res.status).toBe(404);
  });
});

describe("GET /api/assembly/:jobId/status (poll by job id)", () => {
  it("200: same status shape as the quarter+mode poll", async () => {
    const registry = makeRegistry({
      get: jest.fn().mockReturnValue(makeJob({ status: { tag: "queued" } })),
    });
    const app = buildApp(makeStorage(), registry);

    const res = await request(app).get("/api/assembly/job-1/status");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ jobId: "job-1", status: "queued" });
  });

  it("404: unknown/expired job id", async () => {
    const registry = makeRegistry({ get: jest.fn().mockReturnValue(undefined) });
    const app = buildApp(makeStorage(), registry);

    const res = await request(app).get("/api/assembly/does-not-exist/status");

    expect(res.status).toBe(404);
  });
});

describe("GET /api/assembly/:jobId/download", () => {
  const readyResultPath = "/tmp/assembled.odt";

  // The download handler MUST `stat` `resultPath` before streaming (contract
  // §4 — a pruned `ready` job's file is a 404, never a 500). That means this
  // "200" case needs a real file on disk at `readyResultPath` to be
  // distinguishable from the "404: pruned" case below, which intentionally
  // points at a path that never exists.
  beforeAll(() => {
    fs.writeFileSync(readyResultPath, "fake odt contents");
  });

  afterAll(() => {
    fs.unlinkSync(readyResultPath);
  });

  it("200: streams the .odt with the correct Content-Type and both Content-Disposition filenames", async () => {
    const registry = makeRegistry({
      get: jest
        .fn()
        .mockReturnValue(makeJob({ status: { tag: "ready", resultPath: "/tmp/assembled.odt" } })),
    });
    const app = buildApp(makeStorage(), registry);

    const res = await request(app).get("/api/assembly/job-1/download");

    expect(res.status).toBe(200);
    expect(res.type).toBe("application/vnd.oasis.opendocument.text");
    const disposition = res.header["content-disposition"] as string;
    expect(disposition).toMatch(/^attachment;/);
    expect(disposition).toMatch(/filename="[^"]+\.odt"/);
    expect(disposition).toMatch(/filename\*=UTF-8''[^;]+\.odt/);
  });

  it("409: job exists but is not ready (queued/running/failed) — no partial file served", async () => {
    const registry = makeRegistry({
      get: jest.fn().mockReturnValue(makeJob({ status: { tag: "running" } })),
    });
    const app = buildApp(makeStorage(), registry);

    const res = await request(app).get("/api/assembly/job-1/download");

    expect(res.status).toBe(409);
  });

  it("404: unknown/expired job id", async () => {
    const registry = makeRegistry({ get: jest.fn().mockReturnValue(undefined) });
    const app = buildApp(makeStorage(), registry);

    const res = await request(app).get("/api/assembly/does-not-exist/download");

    expect(res.status).toBe(404);
  });

  it("404: ready job whose result file was already pruned by the 24h cleanup (never a 500)", async () => {
    const registry = makeRegistry({
      get: jest.fn().mockReturnValue(
        makeJob({
          status: { tag: "ready", resultPath: "/tmp/assembly-work-test/pruned-does-not-exist.odt" },
        })
      ),
    });
    const app = buildApp(makeStorage(), registry);

    const res = await request(app).get("/api/assembly/job-1/download");

    expect(res.status).toBe(404);
  });
});
