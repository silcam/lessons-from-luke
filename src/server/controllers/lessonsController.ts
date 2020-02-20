import { Express } from "express";
import { addGetHandler, addPostHandler } from "../api/WebAPI";
import { Persistence } from "../../core/interfaces/Persistence";
import { ENGLISH_ID } from "../../core/models/Language";
import { DocString } from "../../core/models/DocString";
import updateLesson from "../actions/updateLesson";

export default function lessonsController(app: Express, storage: Persistence) {
  addGetHandler(app, "/api/lessons", async req => {
    return storage.lessons();
  });

  addGetHandler(app, "/api/lessons/:lessonId", async req => {
    const lesson = await storage.lesson(parseInt(req.params.lessonId));
    if (!lesson) throw { status: 404 };

    return lesson;
  });

  addPostHandler(app, "/api/admin/lessons/:lessonId/strings", async req => {
    const docStrings: DocString[] = req.body;
    const lessonId = parseInt(req.params.lessonId);
    const lesson = await updateLesson(lessonId, docStrings, storage);
    const tStrings = await storage.tStrings({
      languageId: ENGLISH_ID,
      lessonId
    });
    return { lesson, tStrings };
  });
}
