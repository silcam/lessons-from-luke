import { Express } from "express";
import { PGTestStorage } from "../storage/PGStorage";

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
}
