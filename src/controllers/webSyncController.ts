import { Express } from "express";
import * as Manifest from "../util/Manifest";
import * as Storage from "../util/Storage";
import { decode } from "../util/timestampEncode";
import { SyncFetchResponse } from "../util/desktopSync";

export default function webSyncController(app: Express) {
  app.get("/desktop/fetch/:projectCode", (req, res) => {
    const project = Manifest.readProjectManifest(
      decode(req.params.projectCode)
    );
    const lessons = project.lessons.map(projectLesson => ({
      lesson: projectLesson.lesson,
      strings: Storage.getTStrings(project, projectLesson.lesson)
    }));
    const data: SyncFetchResponse = { project, lessons };
    res.send(data);
  });
}
