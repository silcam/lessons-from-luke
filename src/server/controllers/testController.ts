import { Express } from "express";
import { PGTestStorage } from "../storage/PGStorage";
import { sentEmails } from "../email/MemoryEmailTransport";

export default function testController(app: Express, storage: PGTestStorage) {
  app.post("/api/test/reset-storage", async (req, res) => {
    await storage.reset();
    res.status(204).send();
  });

  app.post("/api/test/persist-storage", async (req, res) => {
    await storage.writeToDisk();
    res.status(204).send();
  });

  app.post("/api/test/close-storage", async (req, res) => {
    await storage.close();
    res.status(204).send();
  });

  /**
   * Returns the current MemoryEmailTransport sentEmails buffer.
   * Used by integration tests to read reset/invitation emails sent by the
   * integration server child process (research.md §D9 cross-process strategy).
   */
  app.get("/api/test/sent-emails", (_req, res) => {
    res.json([...sentEmails]);
  });

  /**
   * Clears the MemoryEmailTransport sentEmails buffer.
   * Integration tests call this in beforeEach to avoid email leakage between
   * tests (the server's in-process buffer outlives individual test cleanup).
   */
  app.post("/api/test/clear-emails", (_req, res) => {
    sentEmails.splice(0);
    res.status(204).send();
  });
}
