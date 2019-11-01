import { Express } from "express";
import * as Manifest from "../util/Manifest";
import * as Storage from "../util/Storage";
import { decode } from "../util/timestampEncode";
import { UpSyncPackage, UnlockPackage } from "../util/desktopSync";
import bodyParser from "body-parser";

const jsonBodyParser = bodyParser.json({ limit: "50mb" });

export default function webSyncController(app: Express) {
  app.get("/desktop/fetch/:projectCode", (req, res) => {
    let project = Manifest.readProjectManifest(decode(req.params.projectCode));
    if (project.lockCode) {
      res.status(403).send("This project is locked for a desktop user.");
    } else {
      project = Manifest.lockProject(project.datetime);
      res.send(project);
    }
  });

  app.get("/desktop/fetch/:projectTimestamp/lesson/:lesson", (req, res) => {
    let project = Manifest.readProjectManifest(
      parseInt(req.params.projectTimestamp)
    );
    if (project.lockCode !== req.query.lockCode) {
      res.status(403).send("Invalid desktop lock"); // Future -> extract this to middleware function for this endpoint and the next
    } else {
      res.send(Storage.getTStrings(project, req.params.lesson));
    }
  });

  app.put("/desktop/push", jsonBodyParser, (req, res) => {
    const syncPackage: UpSyncPackage = req.body;
    const project = Manifest.readProjectManifest(syncPackage.project.datetime);
    if (project.lockCode !== syncPackage.project.lockCode) {
      res.status(403).send("Invalid write lock");
    } else {
      Storage.saveTStrings(
        project,
        syncPackage.lesson.lesson,
        syncPackage.lesson.strings
      );
      Manifest.saveProgress(
        project,
        syncPackage.lesson.lesson,
        syncPackage.lesson.strings
      );
      res.status(204).send();
    }
  });

  app.post("/desktop/unlock", jsonBodyParser, (req, res) => {
    const body: UnlockPackage = req.body;
    const { lockCode, datetime } = body;
    const project = Manifest.readProjectManifest(datetime);
    if (project.lockCode && project.lockCode !== lockCode) {
      res.status(403).send("Invalid write lock");
    } else {
      Manifest.unlockProject(datetime);
      res.status(204).send();
    }
  });
}
