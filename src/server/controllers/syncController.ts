import { Express } from "express";
import { addGetHandler } from "../api/WebAPI";
import { Persistence } from "../../core/interfaces/Persistence";
import { decodeLanguageTimestamps } from "../../core/interfaces/Api";

export default function syncController(app: Express, storage: Persistence) {
  addGetHandler(
    app,
    "/api/sync/:timestamp/languages/:languageTimestamps?",
    async req => {
      const languageTimestamps = decodeLanguageTimestamps(
        req.params.languageTimestamps || ""
      );

      const timestamp: number = parseInt(req.params.timestamp);
      if (!timestamp) throw { status: 400 };

      return storage.sync(timestamp, languageTimestamps);
    }
  );
}
