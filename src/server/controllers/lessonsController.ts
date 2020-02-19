import { Express } from "express";
import { addGetHandler, addPostHandler } from "../api/WebAPI";
import { Persistence } from "../../core/interfaces/Persistence";
import { isWithCode } from "../../core/models/Language";

export default function lessonsController(app: Express, storage: Persistence) {
  addGetHandler(app, "/api/lessons", async req => {
    return storage.lessons();
  });

  addGetHandler(app, "/api/lessons/:lessonId", async req => {
    const lesson = await storage.lesson(parseInt(req.params.lessonId));
    if (!lesson) throw { status: 404 };

    return lesson;
  });
}
