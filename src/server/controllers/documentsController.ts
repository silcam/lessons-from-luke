import { Express } from "express";
import fileUpload, { UploadedFile } from "express-fileupload";
import { handleErrors } from "../api/WebAPI";
import { Persistence } from "../../core/interfaces/Persistence";
import { ENGLISH_ID } from "../../core/models/Language";
import { Book } from "../../core/models/Lesson";
import {
  uploadEnglishDoc,
  uploadNonenglishDoc
} from "../actions/uploadDocument";
import bodyParser from "body-parser";

export interface EnglishUploadMeta {
  languageId: number;
  book: Book;
  series: number;
  lesson: number;
}
interface OtherUploadMeta {
  languageId: number;
  lessonId: number;
}
type DocUploadMeta = EnglishUploadMeta | OtherUploadMeta;

const formDataParser = bodyParser.urlencoded({ extended: false });

export default function documentsController(
  app: Express,
  storage: Persistence
) {
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

function isEnglishUpload(meta: DocUploadMeta): meta is EnglishUploadMeta {
  return meta.languageId === ENGLISH_ID;
}
