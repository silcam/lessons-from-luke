import { Express } from "express";
import { Persistence } from "../../core/interfaces/Persistence";

export default function testController(app: Express, storage: Persistence) {
  app.post("/api/test/reset-storage", async (req, res) => {
    await storage.reset();
    res.status(204).send();
  });
}
