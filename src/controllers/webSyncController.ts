import { Express } from "express";
import * as Manifest from "../util/Manifest";
import * as Storage from "../util/Storage";
import { decode } from "../util/timestampEncode";
import { SyncFetchResponse } from "../util/desktopSync";

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
      const data: SyncFetchResponse = { project, lessons };
      res.send(data);
    }
  });
}
