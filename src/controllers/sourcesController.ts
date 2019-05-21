import { Express } from "express";
import requireAdmin from "../util/requireAdmin";
import bodyParser from "body-parser";
import fileUpload, { UploadedFile } from "express-fileupload";
import uploadDocument from "../routes/uploadDocument";
import * as Storage from "../util/Storage";
import * as Manifest from "../util/Manifest";
import layout from "../util/layout";
import Mustache from "mustache";
import { getTemplate } from "../util/getTemplate";
import updateSrcStrings from "../util/updateSrcStrings";
import { DocString } from "../xml/parse";

const formDataParser = bodyParser.urlencoded({ extended: false });

export default function sourcesController(app: Express) {
  app.post("/sources", requireAdmin, formDataParser, (req, res) => {
    Manifest.addSourceLanguage(req.body.language);
    Storage.makeLangDir(req.body.language);
    res.redirect(`/sources/${req.body.language}`);
  });

  app.get("/sources/:language", requireAdmin, (req, res) => {
    const langManifest = Manifest.readSourceManifest(req.params.language);
    res.send(layout(Mustache.render(getTemplate("sourceLang"), langManifest)));
  });

  app.post(
    "/sources/:language",
    requireAdmin,
    formDataParser,
    fileUpload(),
    async (req, res, next) => {
      try {
        const file = req.files.document as UploadedFile;
        const lessonId = await uploadDocument(
          req.params.language,
          req.body.series,
          file
        );
        res.redirect(
          `/sources/${req.params.language}/lessons/${
            lessonId.lesson
          }/versions/${lessonId.version}`
        );
      } catch (err) {
        next(err);
      }
    }
  );

  app.get(
    "/sources/:language/lessons/:lesson/versions/:version",
    requireAdmin,
    (req, res) => {
      const lessonId: Storage.LessonId = req.params;
      const lessonManifest = Manifest.readSourceManifest(
        lessonId.language,
        lessonId.lesson
      );
      const srcStrings = Storage.getSrcStrings(lessonId);
      const projects = lessonManifest.versions[lessonId.version - 1].projects;
      const deleteIfCanDelete = projects.length == 0 ? "Delete" : "";
      res.send(
        layout(
          Mustache.render(getTemplate("srcStrings"), {
            srcStrings: srcStringsForTemplate(srcStrings),
            ...lessonId,
            lessonId: Storage.lessonIdToString(lessonId),
            projects,
            deleteIfCanDelete
          })
        )
      );
    }
  );

  app.get(
    "/sources/:language/lessons/:lesson/versions/:version/edit",
    requireAdmin,
    (req, res) => {
      const lessonId: Storage.LessonId = req.params;
      const srcStrings = Storage.getSrcStrings(lessonId);
      res.send(
        layout(
          Mustache.render(getTemplate("editSrcStrings"), {
            srcStrings: srcStringsForTemplate(srcStrings),
            ...lessonId,
            submitUrl: `/sources/${lessonId.language}/lessons/${
              lessonId.lesson
            }/versions/${lessonId.version}`
          })
        )
      );
    }
  );

  app.post(
    "/sources/:language/lessons/:lesson/versions/:version",
    requireAdmin,
    formDataParser,
    (req, res) => {
      const oldLessonId = req.params as Storage.LessonId;
      updateSrcStrings(oldLessonId, req.body);
      res.redirect(`/sources/${oldLessonId.language}`);
    }
  );

  app.get(
    "/sources/:language/lessons/:lesson/versions/:version/delete",
    (req, res) => {
      const lessonId: Storage.LessonId = req.params;
      Manifest.deleteLessonVersion(lessonId);
      res.redirect(`/sources/${lessonId.language}`);
    }
  );
}

function srcStringsForTemplate(srcStrings: DocString[]) {
  return srcStrings.map((src, index) => ({
    ...src,
    id: index,
    tdClass: src.mtString ? "mtString" : "otherString"
  }));
}
