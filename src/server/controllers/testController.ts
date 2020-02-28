import { Express } from "express";
import { TestPersistence } from "../../core/interfaces/Persistence";

export default function testController(app: Express, storage: TestPersistence) {
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
}
