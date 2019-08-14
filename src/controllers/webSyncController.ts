import { Express } from "express";
import * as Manifest from "../util/Manifest";
import * as Storage from "../util/Storage";
import { decode } from "../util/timestampEncode";
import { SyncPackage } from "../util/desktopSync";
import bodyParser from "body-parser";

const jsonBodyParser = bodyParser.json({ limit: "50mb" });

export default function webSyncController(app: Express) {
  app.get("/desktop/fetch/:projectCode", (req, res) => {
    let project = Manifest.readProjectManifest(decode(req.params.projectCode));
    if (project.lockCode) {
      res.status(403).send("This project is locked for a desktop user.");
    } else {
      project = Manifest.lockProject(project.datetime);
      const lessons = project.lessons.map(projectLesson => ({
        lesson: projectLesson.lesson,
        strings: Storage.getTStrings(project, projectLesson.lesson)
      }));
      const data: SyncPackage = { project, lessons };
      res.send(data);
    }
  });

  app.put("/desktop/push", jsonBodyParser, (req, res) => {
    const syncPackage: SyncPackage = req.body;
    const project = Manifest.readProjectManifest(syncPackage.project.datetime);
    if (project.lockCode !== syncPackage.project.lockCode) {
      res.status(403).send("Invalid write lock");
    } else {
      syncPackage.lessons.forEach(lesson => {
        Storage.saveTStrings(project, lesson.lesson, lesson.strings);
        Manifest.saveProgress(project, lesson.lesson, lesson.strings);
      });
      res.status(204).send();
    }
  });
}
