import { Express } from "express";
import { decode } from "../../core/util/timestampEncode";
import { UpSyncPackage, UnlockPackage } from "../../desktop/desktopSync";
import bodyParser from "body-parser";
import {
  readProject,
  writeProjectLanguage,
  getTStrings,
  saveTStrings,
  getTStringsHistory,
  saveTStringsHistory
} from "../FileStorage";
import { lockProject, updateTStrings, unlockProject } from "../../core/Project";

const jsonBodyParser = bodyParser.json({ limit: "50mb" });

export default function webSyncController(app: Express) {
  app.get("/desktop/fetch/:projectCode", (req, res) => {
    let project = readProject(decode(req.params.projectCode));
    if (project.lockCode) {
      res.status(403).send("This project is locked for a desktop user.");
    } else {
      project = lockProject(project);
      writeProjectLanguage(project);
      res.send(project);
    }
  });

  app.get("/desktop/fetch/:projectTimestamp/lesson/:lesson", (req, res) => {
    let project = readProject(parseInt(req.params.projectTimestamp));
    if (project.lockCode !== req.query.lockCode) {
      res.status(403).send("Invalid desktop lock"); // Future -> extract this to middleware function for this endpoint and the next
    } else {
      res.send(getTStrings(project, req.params.lesson));
    }
  });

  app.put("/desktop/push", jsonBodyParser, (req, res) => {
    const syncPackage: UpSyncPackage = req.body;
    const project = readProject(syncPackage.project.datetime);
    if (project.lockCode !== syncPackage.project.lockCode) {
      res.status(403).send("Invalid write lock");
    } else {
      const [newProject, newTStringHistory] = updateTStrings(
        project,
        syncPackage.lesson.lesson,
        getTStrings(project, syncPackage.lesson.lesson),
        syncPackage.lesson.strings,
        getTStringsHistory(project, syncPackage.lesson.lesson)
      );
      writeProjectLanguage(newProject);
      saveTStrings(
        project,
        syncPackage.lesson.lesson,
        syncPackage.lesson.strings
      );
      saveTStringsHistory(
        project,
        syncPackage.lesson.lesson,
        newTStringHistory
      );
      res.status(204).send();
    }
  });

  app.post("/desktop/unlock", jsonBodyParser, (req, res) => {
    const body: UnlockPackage = req.body;
    const { lockCode, datetime } = body;
    const project = readProject(datetime);
    if (project.lockCode && project.lockCode !== lockCode) {
      res.status(403).send("Invalid write lock");
    } else {
      const newProject = unlockProject(project);
      writeProjectLanguage(newProject);
      res.status(204).send();
    }
  });
}
