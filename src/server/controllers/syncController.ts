import { Express } from "express";
import { addGetHandler } from "../api/WebAPI";
import { Persistence } from "../../core/interfaces/Persistence";

export default function syncController(app: Express, storage: Persistence) {
  addGetHandler(
    app,
    "/api/sync/:timestamp/languages/:languageIds/",
    async req => {
      const languageIds = req.params.languageIds.split(",").map(id => {
        const val = parseInt(id);
        if (!val) throw { status: 400 };
        return val;
      });
      const timestamp: number = parseInt(req.params.timestamp);
      if (!timestamp) throw { status: 400 };

      return storage.sync(timestamp, languageIds);
    }
  );
}
