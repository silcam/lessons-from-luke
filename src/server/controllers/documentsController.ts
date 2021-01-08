import { Express } from "express";
import fileUpload, { UploadedFile } from "express-fileupload";
import { handleErrors } from "../api/WebAPI";
import { Persistence } from "../../core/interfaces/Persistence";
import { ENGLISH_ID } from "../../core/models/Language";
import {
  uploadEnglishDoc,
  uploadNonenglishDoc
} from "../actions/uploadDocument";
import bodyParser from "body-parser";
import {
  DocUploadMeta,
  isEnglishUpload
} from "../../core/models/DocUploadMeta";
import webifyLesson from "../actions/webifyLesson";
import makeLessonFile from "../actions/makeLessonFile";

const formDataParser = bodyParser.urlencoded({ extended: false });

export default function documentsController(
  app: Express,
  storage: Persistence
) {
  app.get(
    "/api/languages/:languageId/lessons/:lessonId/document",
    async (req, res) => {
      handleErrors(res, async () => {
        const language = await storage.language({
          languageId: parseInt(req.params.languageId)
        });
        const lesson = await storage.lesson(parseInt(req.params.lessonId));
        if (!lesson || !language) throw { status: 404 };

        let majorityLangId: number = parseInt(req.query.majorityLanguageId);
        if (isNaN(majorityLangId))
          majorityLangId = language.motherTongue
            ? language.defaultSrcLang
            : language.languageId;

        const filepath = await makeLessonFile(
          storage,
          lesson,
          language,
          majorityLangId
        );
        res.sendFile(filepath);
      });
    }
  );

  app.post(
    "/api/admin/documents",
    formDataParser,
    fileUpload(),
    async (req, res) => {
      handleErrors(res, async () => {
        const file = req.files!.document as UploadedFile;
        const meta: DocUploadMeta = readPostBody(req.body);

        if (isEnglishUpload(meta)) {
          const lesson = await uploadEnglishDoc(file, meta, storage);
          const tStrings = await storage.tStrings({
            languageId: ENGLISH_ID,
            lessonId: lesson.lessonId
          });
          res.send({ lesson, tStrings });
          webifyLesson(lesson);
        } else {
          const docStrings = await uploadNonenglishDoc(file);
          const lesson = await storage.lesson(meta.lessonId);
          const tStrings = await storage.tStrings({
            languageId: ENGLISH_ID,
            lessonId: meta.lessonId
          });
          res.send({ docStrings, lesson, tStrings });
        }
      });
    }
  );
}

function readPostBody(body: any) {
  ["languageId", "series", "lesson", "lessonId"].forEach(key => {
    if (key in body) body = { ...body, [key]: parseInt(body[key]) };
  });
  return body;
}
