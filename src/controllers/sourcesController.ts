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
import staticAssetPath from "../util/assetPath";
import srcCompare from "../util/srcCompare";
import last from "../util/last";

const formDataParser = bodyParser.urlencoded({ extended: false });

export default function sourcesController(app: Express) {
  app.post("/sources", requireAdmin, formDataParser, (req, res) => {
    Manifest.addSourceLanguage(req.body.language);
    Storage.makeLangDir(req.body.language);
    res.redirect(`/sources/${req.body.language}`);
  });

  app.get("/sources/:language", requireAdmin, (req, res) => {
    const langManifest = Manifest.readSourceManifest(req.params.language);
    const srcManifest = Manifest.readSourceManifest();
    const langCompare = {
      name: langManifest.language,
      lessons: Storage.getAllSrcStrings(langManifest)
    };
    res.send(
      layout(
        Mustache.render(getTemplate("sourceLang"), {
          ...langManifest,
          interchangeability: srcManifest
            .filter(src => src.language !== langManifest.language)
            .map(src => {
              const comp = srcCompare(langCompare, {
                name: src.language,
                lessons: Storage.getAllSrcStrings(src)
              });
              return {
                lang: src.language,
                comp: {
                  ...comp,
                  errors: comp.errors.map(err => ({
                    ...err,
                    showLink: err.lessonIndex !== undefined,
                    url: `/sources/${langManifest.language}/compare/${src.language}/${err.lessonIndex}`
                  }))
                }
              };
            })
        })
      )
    );
  });

  app.post(
    "/sources/:language",
    requireAdmin,
    formDataParser,
    fileUpload(),
    async (req, res, next) => {
      try {
        const file = req.files!.document as UploadedFile;
        const lessonId = await uploadDocument(
          req.params.language,
          req.body.series,
          file
        );
        res.redirect(
          `/sources/${req.params.language}/lessons/${lessonId.lesson}/versions/${lessonId.version}`
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
            jsPath: staticAssetPath("editSrcStrings.js"),
            srcStrings: srcStringsForTemplate(srcStrings),
            ...lessonId,
            submitUrl: `/sources/${lessonId.language}/lessons/${lessonId.lesson}/versions/${lessonId.version}`
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

  app.get(
    "/sources/:language/compare/:otherLanguage/:lessonIndex",
    (req, res) => {
      const myManifest = Manifest.readSourceManifest(req.params.language);
      const hisManifest = Manifest.readSourceManifest(req.params.otherLanguage);
      const lessonIndex = parseInt(req.params.lessonIndex);
      const myStrings = srcStringsForLessonIndex(
        myManifest,
        lessonIndex
      ).filter(s => s.mtString);
      const hisStrings = srcStringsForLessonIndex(
        hisManifest,
        lessonIndex
      ).filter(s => s.mtString);
      const ourStrings: string[][] = [];
      for (let i = 0; i < Math.max(myStrings.length, hisStrings.length); ++i) {
        ourStrings.push([
          myStrings[i] ? myStrings[i].text : "",
          hisStrings[i] ? hisStrings[i].text : ""
        ]);
      }
      res.send(
        layout(
          Mustache.render(getTemplate("srcCompare"), {
            myManifest,
            hisManifest,
            ourStrings
          })
        )
      );
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

function srcStringsForLessonIndex(
  manifest: Manifest.Language,
  lessonIndex: number
) {
  return Storage.getSrcStrings({
    language: manifest.language,
    lesson: manifest.lessons[lessonIndex].lesson,
    version: last(manifest.lessons[lessonIndex].versions).version
  });
}
