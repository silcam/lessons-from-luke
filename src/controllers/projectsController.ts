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
          extraProgressClass
        })
      )
    );
  });
}
