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
import { prjUpdateDiff } from "../util/projectUpdate";
import usfmUpload from "../routes/usfmUpload";

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
    const locked = projectManifest.lockCode !== undefined;
    res.send(
      layout(
        Mustache.render(getTemplate("project"), {
          ...projectManifest,
          projectCode: encode(projectId.datetime),
          projectId: req.params.projectId,
          locked,
          updatesAvailable:
            !locked &&
            Manifest.projectSrcUpdatesAvailable(projectId.datetime).length > 0,
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
      const projectId = Storage.projectIdFromString(req.params
        .projectId as string);
      const projectManifest = Manifest.readProjectManifest(projectId.datetime);
      const file = req.files!.usfmFile as UploadedFile;
      const usfm = file.data.toString();
      const overwrite = !!req.body.overwrite;
      const uploadResult = usfmUpload(usfm, projectManifest, overwrite);
      res.send(
        layout(
          Mustache.render(getTemplate("usfmTranslated"), {
            targetLang: projectManifest.targetLang,
            projectId: req.params.projectId,
            ...uploadResult
          })
        )
      );
    }
  );

  app.get("/projects/:projectId/update/:lessonIndex?", (req, res) => {
    const projectId = Storage.projectIdFromString(req.params
      .projectId as string);
    const projectManifest = Manifest.readProjectManifest(projectId.datetime);
    const updatesAvailable = Manifest.projectSrcUpdatesAvailable(
      projectId.datetime
    );
    const lessonIndex =
      parseInt(req.params.lessonIndex) || updatesAvailable[0][0];
    const targetVersion = updatesAvailable.find(
      upd => upd[0] == lessonIndex
    )![1];
    const nextUpdate =
      updatesAvailable[
        updatesAvailable.findIndex(nums => nums[0] == lessonIndex) + 1
      ];
    const diff = prjUpdateDiff(projectManifest, lessonIndex);
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
          targetLang: projectManifest.targetLang,
          lessonName: projectManifest.lessons[lessonIndex].lesson,
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
      const projectId = Storage.projectIdFromString(req.params
        .projectId as string);
      const targetVersion = parseInt(req.body.targetVersion);
      const lessonIndex = parseInt(req.params.lessonIndex);
      const projectManifest = Manifest.updateProjectLessonSrc(
        projectId.datetime,
        req.params.lessonIndex,
        targetVersion
      );
      const prjLesson = projectManifest.lessons[lessonIndex];
      const newSrcStrings = Storage.getSrcStrings({
        language: projectManifest.sourceLang,
        lesson: prjLesson.lesson,
        version: targetVersion
      });
      const newTStrings: Storage.TDocString[] = newSrcStrings.map(
        (str, index) => ({
          id: index,
          xpath: str.xpath,
          src: str.text,
          targetText: req.body[`${index}`] || "",
          mtString: str.mtString
        })
      );
      Storage.saveTStrings(projectManifest, prjLesson.lesson, newTStrings);

      const availUpdates = Manifest.projectSrcUpdatesAvailable(
        projectManifest.datetime
      );
      const nextUpdate = availUpdates.find(update => update[0] > lessonIndex);
      if (nextUpdate)
        res.redirect(
          `/projects/${req.params.projectId}/update/${nextUpdate[0]}`
        );
      else res.redirect(`/projects/${req.params.projectId}`);
    }
  );
}
