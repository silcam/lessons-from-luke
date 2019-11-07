import { Express, Request } from "express";
import requireAdmin from "../util/requireAdmin";
import bodyParser from "body-parser";
import layout from "../util/layout";
import Mustache from "mustache";
import { getTemplate } from "../getTemplate";
import { encode } from "../../core/util/timestampEncode";
import { extraProgressClass } from "./translateController";
import fileUpload, { UploadedFile } from "express-fileupload";
import usfmUpload from "../actions/usfmUpload";
import {
  readProject,
  readSource,
  getTStrings,
  getTStringsHistory,
  getSrcStrings,
  saveTStrings,
  writeSourceLanguage,
  writeProjectLanguage,
  saveTStringsHistory
} from "../FileStorage";
import createProject from "../actions/createProject";
import projectUpdate from "../actions/projectUpdate";
import {
  updateLessonVersion,
  projectIdFromString,
  Project,
  projectSrcUpdatesAvailable,
  unlockProject
} from "../../core/Project";

const formDataParser = bodyParser.urlencoded({ extended: false });

export default function projectsController(app: Express) {
  app.post("/projects", requireAdmin, formDataParser, (req, res) => {
    createProject(
      req.body.sourceLang,
      req.body.targetLang,
      req.body.fullTranslation
    );
    res.redirect(`/`);
  });

  app.get("/projects/:projectId", requireAdmin, (req, res) => {
    const project = getProject(req);
    const source = readSource(project.sourceLang);
    const locked = project.lockCode !== undefined;
    res.send(
      layout(
        Mustache.render(getTemplate("project"), {
          ...project,
          projectCode: encode(project.datetime),
          projectId: req.params.projectId,
          locked,
          updatesAvailable:
            !locked &&
            !project.fullTranslation && // Project update does not work with meta and styles strings and probably isn't needed for full translations
            projectSrcUpdatesAvailable(source, project).length > 0,
          extraProgressClass
        })
      )
    );
  });

  app.get("/projects/:projectId/lessons/:lesson", (req, res) => {
    const project = getProject(req);
    const tStrings = getTStrings(project, req.params.lesson);
    res.send(
      layout(
        Mustache.render(getTemplate("projectLesson"), {
          projectId: req.params.projectId,
          ...project,
          lesson: req.params.lesson,
          tStrings
        })
      )
    );
  });

  app.get("/projects/:projectId/lessonHistory/:lesson", (req, res) => {
    const project = getProject(req);
    const history = getTStringsHistory(project, req.params.lesson);
    const viewHistory = history.reverse().map(item => ({
      ...item,
      timestamp: new Date(item.time).toString().replace(/:\d\d GMT.*/, "")
    }));
    res.send(
      layout(
        Mustache.render(getTemplate("projectLessonHistory"), {
          projectId: req.params.projectId,
          ...project,
          lesson: req.params.lesson,
          history: viewHistory
        })
      )
    );
  });

  app.post("/projects/:projectId/unlock", requireAdmin, (req, res) => {
    const projectId = projectIdFromString(req.params.projectId as string);
    const project = unlockProject(readProject(projectId.datetime));
    writeProjectLanguage(project);
    res.redirect(`/projects/${req.params.projectId}`);
  });

  app.post(
    "/projects/:projectId/usfm",
    requireAdmin,
    formDataParser,
    fileUpload(),
    (req, res) => {
      const project = getProject(req);
      const file = req.files!.usfmFile as UploadedFile;
      const usfm = file.data.toString();
      const overwrite = !!req.body.overwrite;
      const uploadResult = usfmUpload(usfm, project, overwrite);
      res.send(
        layout(
          Mustache.render(getTemplate("usfmTranslated"), {
            targetLang: project.targetLang,
            projectId: req.params.projectId,
            ...uploadResult
          })
        )
      );
    }
  );

  app.get("/projects/:projectId/update/:lessonIndex?", (req, res) => {
    const project = getProject(req);
    const source = readSource(project.sourceLang);
    const updatesAvailable = projectSrcUpdatesAvailable(source, project);
    const lessonIndex =
      parseInt(req.params.lessonIndex) || updatesAvailable[0][0];
    const targetVersion = updatesAvailable.find(
      upd => upd[0] == lessonIndex
    )![1];
    const nextUpdate =
      updatesAvailable[
        updatesAvailable.findIndex(nums => nums[0] == lessonIndex) + 1
      ];
    const diff = projectUpdate(project, lessonIndex);
    const viewDiff = diff.map(diffItem => ({
      ...diffItem,
      disableHiddenInput: diffItem.change != "none" ? "disabled" : "",
      disableTextInput:
        !diffItem.mtString ||
        diffItem.change == "none" ||
        diffItem.change == "remove"
          ? "disabled"
          : "",
      displayCopyButton:
        !!diffItem.oldTranslation && diffItem.change == "change"
    }));
    res.send(
      layout(
        Mustache.render(getTemplate("updateLesson"), {
          projectId: req.params.projectId,
          targetLang: project.targetLang,
          lessonName: project.lessons[lessonIndex].lesson,
          skipUrl:
            `/projects/${req.params.projectId}` +
            (nextUpdate ? `/update/${nextUpdate[0]}` : ""),
          lessonIndex,
          targetVersion,
          diff: viewDiff
        })
      )
    );
  });

  app.post(
    "/projects/:projectId/update/:lessonIndex",
    formDataParser,
    (req, res) => {
      const targetVersion = parseInt(req.body.targetVersion);
      const lessonIndex = parseInt(req.params.lessonIndex);
      const project = getProject(req);
      const source = readSource(project.sourceLang);
      const prjLesson = project.lessons[lessonIndex];
      const newSrcStrings = getSrcStrings({
        language: project.sourceLang,
        lesson: prjLesson.lesson,
        version: targetVersion
      });
      const oldTStrings = getTStrings(project, prjLesson.lesson);
      const tStringHistory = getTStringsHistory(project, prjLesson.lesson);

      const [
        newSource,
        newProject,
        newTStrings,
        newTStringHistory
      ] = updateLessonVersion(
        source,
        project,
        lessonIndex,
        prjLesson.version,
        targetVersion,
        newSrcStrings,
        oldTStrings,
        req.body,
        tStringHistory
      );
      writeSourceLanguage(newSource);
      writeProjectLanguage(newProject);
      saveTStrings(project, prjLesson.lesson, newTStrings);
      saveTStringsHistory(project, prjLesson.lesson, newTStringHistory);

      const availUpdates = projectSrcUpdatesAvailable(newSource, newProject);
      const nextUpdate = availUpdates.find(update => update[0] > lessonIndex);
      if (nextUpdate)
        res.redirect(
          `/projects/${req.params.projectId}/update/${nextUpdate[0]}`
        );
      else res.redirect(`/projects/${req.params.projectId}`);
    }
  );
}

function getProject(req: Request): Project {
  const projectId = projectIdFromString(req.params.projectId as string);
  return readProject(projectId.datetime);
}
