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
import { push, getUpSyncStatus } from "../util/desktopSync";
import staticAssetPath from "../util/assetPath";
import copyAheadTranslations from "../util/copyAheadTranslations";

const formDataParser = bodyParser.urlencoded({ extended: false });
const jsonBodyParser = bodyParser.json();
const maxLengthForInput = 120;

type ServerContext = "desktop" | "web";
type ApiTStrings = { id: number; targetText: string }[];

export default function translateController(
  app: Express,
  context: ServerContext
) {
  app.get("/translate/:projectCode", (req, res) => {
    const project = Manifest.readProjectManifest(
      decode(req.params.projectCode)
    );
    const t = i18n(project.sourceLang);
    res.send(
      layout(
        Mustache.render(
          getTemplate("translateIndex"),
          {
            contextWeb: context == "web",
            projectId: Storage.projectIdToString(project),
            project,
            projectLocked: context == "web" && project.lockCode !== undefined,
            extraProgressClass,
            t,
            baseUrl: req.url, //`/translate/${req.params.projectCode}`
            ...syncMessageAndUnlock(context, t)
          },
          {
            syncMessage: getTemplate("syncMessage"),
            desktopUnlock: getTemplate("desktopUnlock")
          }
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
          const editable = project.fullTranslation || tString.mtString;
          return {
            ...tString,
            className: tString.mtString ? "mtString" : "otherString",
            editDisplay: editable ? "inline" : "none",
            inputDisplay: longText ? "none" : "inline-block",
            areaDisplay: longText ? "inline-block" : "none",
            inputDisabled: longText || !editable ? "disabled" : "",
            areaDisabled: !longText || !editable ? "disabled" : ""
          };
        }
      );
      res.send(
        layout(
          Mustache.render(getTemplate("translateLesson"), {
            sourceLang: project.sourceLang,
            targetLang: project.targetLang,
            jsPath: staticAssetPath("translate.js"),
            strings: tStrings,
            projectUrl: `/translate/${req.params.projectCode}`,
            lessonUrl: req.url, // `/translate/${req.params.projectCode}/lesson/${lesson}`,
            apiUrl: req.url.replace("translate", "translate-api"),
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
      copyAheadTranslations(project, req.params.lesson, tStrings);
      if (context == "desktop") await push(req.params.lesson);
      res.redirect(`/translate/${req.params.projectCode}`);
    }
  );

  app.post(
    "/translate-api/:projectCode/lesson/:lesson",
    lockCheck(context),
    jsonBodyParser,
    (req, res) => {
      const project = req.params.project; // Added during lockCheck
      const tStrings = Storage.getTStrings(project, req.params.lesson);
      const translations: ApiTStrings = req.body;
      translations.forEach(
        translation =>
          (tStrings[translation.id].targetText = translation.targetText.trim())
      );
      Storage.saveTStrings(project, req.params.lesson, tStrings);
      res.status(204).send();
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

function syncMessageAndUnlock(context: ServerContext, t: Translations) {
  if (context == "web")
    return {
      showDesktopSync: false,
      desktopNeedToSync: false,
      desktopNeedToSyncMessage: "",
      showUnlockButton: false
    };
  const syncStatus = getUpSyncStatus();
  return {
    showDesktopSync: syncStatus.savedChanges,
    desktopNeedToSync: syncStatus.needToSync.length > 0,
    desktopNeedToSyncMessage:
      syncStatus.needToSync.length > 0 ? t.needToSync : t.synced,
    showUnlockButton: syncStatus.needToSync.length === 0
  };
}
