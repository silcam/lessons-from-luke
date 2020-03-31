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
import docStorage from "../storage/docStorage";
import { lessonName } from "../../core/models/Lesson";
import mergeXml from "../xml/mergeXml";
import { makeDocStrings } from "../../core/models/DocString";
import webifyLesson from "../actions/webifyLesson";

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

        const engFilePath = docStorage.docFilepath(lesson);
        if (language.languageId == ENGLISH_ID) {
          res.sendFile(engFilePath);
        } else {
          const mtTStrings = await storage.tStrings({
            languageId: language.languageId,
            lessonId: lesson.lessonId
          });
          const otherTStrings = language.motherTongue
            ? await storage.tStrings({
                languageId: language.defaultSrcLang,
                lessonId: lesson.lessonId
              })
            : mtTStrings;
          const docStrings = makeDocStrings(
            lesson.lessonStrings,
            mtTStrings,
            otherTStrings
          );
          const filepath = docStorage.tmpFilePath(
            `${language.name}_${lessonName(lesson)}.odt`
          );
          mergeXml(engFilePath, filepath, docStrings);
          res.sendFile(filepath);
        }
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
