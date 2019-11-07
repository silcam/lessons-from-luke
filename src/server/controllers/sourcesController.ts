import { Express } from "express";
import requireAdmin from "../util/requireAdmin";
import bodyParser from "body-parser";
import fileUpload, { UploadedFile } from "express-fileupload";
import uploadDocument from "../actions/uploadDocument";
import layout from "../util/layout";
import Mustache from "mustache";
import { getTemplate } from "../getTemplate";
import updateSrcStrings from "../actions/updateSrcStrings";
import staticAssetPath from "../util/assetPath";
import srcCompare from "../../core/srcCompare";
import createSource from "../actions/createSource";
import {
  readSourceManifest,
  getAllSrcStrings,
  readSourceLesson,
  getSrcStrings,
  readSource,
  writeSourceLanguage
} from "../FileStorage";
import { findByStrict, last } from "../../core/util/arrayUtils";
import {
  SourceLessonId,
  sourceLessonIdToString,
  deleteLessonVersion,
  Source
} from "../../core/Source";
import { SrcStrings } from "../../core/SrcString";

const formDataParser = bodyParser.urlencoded({ extended: false });

export default function sourcesController(app: Express) {
  app.post("/sources", requireAdmin, formDataParser, (req, res) => {
    createSource(req.body.language);
    res.redirect(`/sources/${req.body.language}`);
  });

  app.get("/sources/:language", requireAdmin, (req, res) => {
    const srcManifest = readSourceManifest();
    const source = findByStrict(srcManifest, "language", req.params.language);
    const langCompare = {
      name: source.language,
      lessons: getAllSrcStrings(source)
    };
    res.send(
      layout(
        Mustache.render(getTemplate("sourceLang"), {
          ...source,
          interchangeability: srcManifest
            .filter(src => src.language !== source.language)
            .map(src => {
              const comp = srcCompare(langCompare, {
                name: src.language,
                lessons: getAllSrcStrings(src)
              });
              return {
                lang: src.language,
                comp: {
                  ...comp,
                  errors: comp.errors.map(err => ({
                    ...err,
                    showLink: err.lessonIndex !== undefined,
                    url: `/sources/${source.language}/compare/${src.language}/${err.lessonIndex}`
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
      const lessonId: SourceLessonId = req.params;
      const sourceLesson = readSourceLesson(lessonId.language, lessonId.lesson);
      const srcStrings = getSrcStrings(lessonId);
      const projects = sourceLesson.versions[lessonId.version - 1].projects;
      const deleteIfCanDelete = projects.length == 0 ? "Delete" : "";
      res.send(
        layout(
          Mustache.render(getTemplate("srcStrings"), {
            srcStrings: srcStringsForTemplate(srcStrings),
            ...lessonId,
            lessonId: sourceLessonIdToString(lessonId),
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
      const lessonId: SourceLessonId = req.params;
      const srcStrings = getSrcStrings(lessonId);
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
      const oldLessonId = req.params as SourceLessonId;
      updateSrcStrings(oldLessonId, req.body);
      res.redirect(`/sources/${oldLessonId.language}`);
    }
  );

  app.get(
    "/sources/:language/lessons/:lesson/versions/:version/delete",
    (req, res) => {
      const lessonId: SourceLessonId = req.params;
      const source = readSource(lessonId.language);
      const newSource = deleteLessonVersion(source, lessonId);
      writeSourceLanguage(newSource);
      res.redirect(`/sources/${lessonId.language}`);
    }
  );

  app.get(
    "/sources/:language/compare/:otherLanguage/:lessonIndex",
    (req, res) => {
      const srcManifest = readSourceManifest();
      const sourceA = findByStrict(
        srcManifest,
        "language",
        req.params.language
      );
      const sourceB = findByStrict(
        srcManifest,
        "language",
        req.params.otherLanguage
      );
      const lessonIndex = parseInt(req.params.lessonIndex);
      const stringsA = srcStringsForLessonIndex(sourceA, lessonIndex).filter(
        s => s.mtString
      );
      const stringsB = srcStringsForLessonIndex(sourceB, lessonIndex).filter(
        s => s.mtString
      );
      const ourStrings: string[][] = [];
      for (let i = 0; i < Math.max(stringsA.length, stringsB.length); ++i) {
        ourStrings.push([
          stringsA[i] ? stringsA[i].text : "",
          stringsB[i] ? stringsB[i].text : ""
        ]);
      }
      res.send(
        layout(
          Mustache.render(getTemplate("srcCompare"), {
            myManifest: sourceA,
            hisManifest: sourceB,
            ourStrings
          })
        )
      );
    }
  );
}

function srcStringsForTemplate(srcStrings: SrcStrings) {
  return srcStrings.map((src, index) => ({
    ...src,
    id: index,
    tdClass: src.mtString ? "mtString" : "otherString"
  }));
}

function srcStringsForLessonIndex(source: Source, lessonIndex: number) {
  return getSrcStrings({
    language: source.language,
    lesson: source.lessons[lessonIndex].lesson,
    version: last(source.lessons[lessonIndex].versions).version
  });
}
