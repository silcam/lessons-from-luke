import { Express } from "express";
import requireAdmin from "../util/requireAdmin";
import bodyParser from "body-parser";
import fileUpload, { UploadedFile } from "express-fileupload";
import uploadDocument from "../routes/uploadDocument";
import * as Storage from "../util/Storage";
import * as Manifest from "../util/Manifest";
import docStrings from "../routes/docStrings";
import layout from "../util/layout";
import Mustache from "mustache";
import { getTemplate } from "../util/getTemplate";
import { decode } from "../util/timestampEncode";
import i18n from "../util/i18n";
import assert = require("assert");

const formDataParser = bodyParser.urlencoded({ extended: false });
const maxLengthForInput = 120;

export default function translateController(app: Express) {
  app.get("/translate/:projectCode", (req, res) => {
    const project = Manifest.readProjectManifest(
      decode(req.params.projectCode)
    );
    const t = i18n(project.sourceLang);
    res.send(
      layout(
        Mustache.render(getTemplate("translateIndex"), {
          lessons: project.lessons,
          extraProgressClass,
          t,
          baseUrl: req.url //`/translate/${req.params.projectCode}`
        })
      )
    );
  });

  app.get("/translate/:projectCode/lesson/:lesson", (req, res) => {
    const project = Manifest.readProjectManifest(
      decode(req.params.projectCode)
    );
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
  });

  app.post(
    "/translate/:projectCode/lesson/:lesson",
    formDataParser,
    (req, res) => {
      const project = Manifest.readProjectManifest(
        decode(req.params.projectCode)
      );
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
