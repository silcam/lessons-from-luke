import { Express, Request, Response, NextFunction } from "express";
import bodyParser from "body-parser";
import * as Storage from "../util/Storage";
import * as Manifest from "../util/Manifest";
import layout from "../util/layout";
import Mustache from "mustache";
import { getTemplate } from "../util/getTemplate";
import { decode } from "../util/timestampEncode";
import i18n, { Translations } from "../util/i18n";
import assert = require("assert");
import { push, getSyncStatus } from "../util/desktopSync";

const formDataParser = bodyParser.urlencoded({ extended: false });
const maxLengthForInput = 120;

type ServerContext = "desktop" | "web";

export default function translateController(
  app: Express,
  context: ServerContext
) {
  app.get("/translate/:projectCode", lockCheck(context), (req, res) => {
    const project = req.params.project; // Added during lockCheck
    const t = i18n(project.sourceLang);
    res.send(
      layout(
        Mustache.render(
          getTemplate("translateIndex"),
          {
            lessons: project.lessons,
            extraProgressClass,
            t,
            baseUrl: req.url, //`/translate/${req.params.projectCode}`
            ...syncMessage(context, t)
          },
          { syncMessage: getTemplate("syncMessage") }
        )
      )
    );
  });

  app.get(
    "/translate/:projectCode/lesson/:lesson",
    lockCheck(context),
    (req, res) => {
      const project = req.params.project; // Added during lockCheck
      const tStrings = Storage.getTStrings(project, req.params.lesson).map(
        tString => {
          const longText = tString.src.length > maxLengthForInput;
          return {
            ...tString,
            className: tString.mtString ? "mtString" : "otherString",
            editDisplay: tString.mtString ? "inline" : "none",
            inputDisplay: longText ? "none" : "inline-block",
            areaDisplay: longText ? "inline-block" : "none",
            inputDisabled: longText ? "disabled" : "",
            areaDisabled: longText ? "" : "disabled"
          };
        }
      );
      res.send(
        layout(
          Mustache.render(getTemplate("translateLesson"), {
            sourceLang: project.sourceLang,
            targetLang: project.targetLang,
            strings: tStrings,
            projectUrl: `/translate/${req.params.projectCode}`,
            lessonUrl: req.url, // `/translate/${req.params.projectCode}/lesson/${lesson}`,
            stringInput,
            t: i18n(project.sourceLang)
          })
        )
      );
    }
  );

  app.post(
    "/translate/:projectCode/lesson/:lesson",
    lockCheck(context),
    formDataParser,
    async (req, res) => {
      const project = req.params.project; // Added during lockCheck
      const tStrings = Storage.getTStrings(project, req.params.lesson);
      const newStrings = req.body as { [id: string]: string };
      Object.keys(newStrings).forEach(id => {
        const targetText = newStrings[id].trim();
        if (targetText.length > 0) {
          const tString = tStrings[parseInt(id)];
          assert(tString.id === parseInt(id));
          tString.targetText = targetText;
        }
      });
      Storage.saveTStrings(project, req.params.lesson, tStrings);
      Manifest.saveProgress(project, req.params.lesson, tStrings);
      if (context == "desktop") await push();
      res.redirect(`/translate/${req.params.projectCode}`);
    }
  );
}

function stringInput() {
  if (this.src.length > maxLengthForInput) {
    return `<textarea name="${this.id}" rows="4">${this.targetText}</textarea>`;
  }
  return `<input type="text" name="${this.id}" value="${this.targetText}" />`;
}

export function extraProgressClass() {
  if (this.progress === undefined) return "noShow";
  if (this.progress == 100) return "done";
}

function lockCheck(context: ServerContext) {
  return (req: Request, res: Response, next: NextFunction) => {
    const project = Manifest.readProjectManifest(
      decode(req.params.projectCode)
    );
    if (context == "web" && project.lockCode) {
      res.send(
        layout(
          Mustache.render(getTemplate("translateLocked"), {
            t: i18n(project.sourceLang)
          })
        )
      );
    } else {
      req.params.project = project;
      next();
    }
  };
}

function syncMessage(context: ServerContext, t: Translations) {
  if (context == "web")
    return {
      showDesktopSync: false,
      desktopNeedToSync: false,
      desktopNeedToSyncMessage: ""
    };
  const syncStatus = getSyncStatus();
  return {
    showDesktopSync: true,
    desktopNeedToSync: syncStatus.needToSync,
    desktopNeedToSyncMessage: syncStatus.needToSync ? t.needToSync : t.synced
  };
}
