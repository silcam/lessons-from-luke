import { Express } from "express";
import requireAdmin from "../util/requireAdmin";
import bodyParser from "body-parser";
import fileUpload, { UploadedFile } from "express-fileupload";
import uploadDocument from "../routes/uploadDocument";
import * as Storage from "../util/Storage";
import * as Manifest from "../util/Manifest";
import docStrings from "../routes/docStrings";
import layout from "../util/layout";
import Mustache from "mustache";
import { getTemplate } from "../util/getTemplate";
import updateSrcStrings from "../util/updateSrcStrings";

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
            srcStrings,
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
      const srcStrings = Storage.getSrcStrings(lessonId).map((src, index) => ({
        ...src,
        id: index
      }));
      res.send(
        layout(
          Mustache.render(getTemplate("editSrcStrings"), {
            srcStrings,
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
}
