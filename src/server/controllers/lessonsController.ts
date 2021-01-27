import { Express } from "express";
import { addGetHandler, addPostHandler } from "../api/WebAPI";
import { Persistence } from "../../core/interfaces/Persistence";
import { ENGLISH_ID } from "../../core/models/Language";
import { DocString } from "../../core/models/DocString";
import updateLesson from "../actions/updateLesson";
import docStorage from "../storage/docStorage";
import webifyLesson from "../actions/webifyLesson";
import findTSubs from "../actions/findTSubs";

export default function lessonsController(app: Express, storage: Persistence) {
  addGetHandler(app, "/api/lessons", async req => {
    return storage.lessons();
  });

  addGetHandler(app, "/api/lessons/:lessonId", async req => {
    const lesson = await storage.lesson(parseInt(req.params.lessonId));
    if (!lesson) throw { status: 404 };

    return lesson;
  });

  addGetHandler(app, "/api/lessons/:lessonId/webified", async req => {
    const lesson = await storage.lesson(parseInt(req.params.lessonId));
    const html = lesson && docStorage.webifiedHtml(lesson);
    if (!html) {
      if (process.env.NODE_ENV == "production" && lesson) {
        webifyLesson(lesson);
      }
      throw { status: 404 };
    }
    return { html };
  });

  addGetHandler(
    app,
    "/api/admin/lessons/:lessonId/lessonUpdateIssues",
    async req => {
      return findTSubs(storage, parseInt(req.params.lessonId));
    }
  );

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
