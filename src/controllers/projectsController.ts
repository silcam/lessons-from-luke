import { Express } from "express";
import requireAdmin from "../util/requireAdmin";
import bodyParser from "body-parser";
import * as Storage from "../util/Storage";
import * as Manifest from "../util/Manifest";
import layout from "../util/layout";
import Mustache from "mustache";
import { getTemplate } from "../util/getTemplate";
import { encode } from "../util/timestampEncode";
import { extraProgressClass } from "./translateController";
import fileUpload, { UploadedFile } from "express-fileupload";
import { usfmParseBook } from "../util/translateFromUsfm";
import translateFromUsfm from "../util/translateFromUsfm";

const formDataParser = bodyParser.urlencoded({ extended: false });

export default function projectsController(app: Express) {
  app.post("/projects", requireAdmin, formDataParser, (req, res) => {
    const project = Manifest.addProject(
      req.body.sourceLang,
      req.body.targetLang
    );
    Storage.makeProjectDir(project);
    res.redirect(`/`);
  });

  app.get("/projects/:projectId", requireAdmin, (req, res) => {
    const projectId = Storage.projectIdFromString(req.params
      .projectId as string);
    const projectManifest = Manifest.readProjectManifest(projectId.datetime);
    res.send(
      layout(
        Mustache.render(getTemplate("project"), {
          ...projectManifest,
          projectCode: encode(projectId.datetime),
          projectId: req.params.projectId,
          locked: projectManifest.lockCode !== undefined,
          extraProgressClass
        })
      )
    );
  });

  app.post("/projects/:projectId/unlock", requireAdmin, (req, res) => {
    const projectId = Storage.projectIdFromString(req.params
      .projectId as string);
    Manifest.unlockProject(projectId.datetime);
    res.redirect(`/projects/${req.params.projectId}`);
  });

  app.post(
    "/projects/:projectId/usfm",
    requireAdmin,
    formDataParser,
    fileUpload(),
    (req, res) => {
      const file = req.files!.usfmFile as UploadedFile;
      const usfm = file.data.toString();
      const bookName = usfmParseBook(usfm);
      const projectId = Storage.projectIdFromString(req.params
        .projectId as string);
      const projectManifest = Manifest.readProjectManifest(projectId.datetime);
      const lessonDiffs: {
        lesson: string;
        diff: { old: string; new: string }[];
      }[] = [];
      const parseErrors: string[] = [];
      projectManifest.lessons.forEach(lesson => {
        if (lesson.lesson.startsWith(bookName)) {
          const oldTStrings = Storage.getTStrings(projectId, lesson.lesson);
          try {
            const newTStrings = translateFromUsfm(oldTStrings, usfm, {
              overwrite: true
            });
            lessonDiffs.push({
              lesson: lesson.lesson,
              diff: calcLessonDiff(oldTStrings, newTStrings)
            });
            Storage.saveTStrings(projectId, lesson.lesson, newTStrings);
            Manifest.saveProgress(projectId, lesson.lesson, newTStrings);
          } catch (err) {
            parseErrors.push(`${lesson.lesson} : ${err}`);
          }
        }
      });
      res.send(
        layout(
          Mustache.render(getTemplate("usfmTranslated"), {
            targetLang: projectManifest.targetLang,
            projectId: req.params.projectId,
            lessonDiffs,
            parseErrors
          })
        )
      );
    }
  );
}

function calcLessonDiff(
  oldTStrings: Storage.TDocString[],
  newTStrings: Storage.TDocString[]
) {
  const diffs: { old: string; new: string }[] = [];
  return newTStrings.reduce((diffs, tString, index) => {
    if (tString.targetText == oldTStrings[index].targetText) return diffs;
    return [
      ...diffs,
      { old: oldTStrings[index].targetText, new: tString.targetText }
    ];
  }, diffs);
}
