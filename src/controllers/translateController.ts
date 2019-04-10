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
import translateLesson from "../routes/translateLesson";
import { decode } from "../util/timestampEncode";
import i18n from "../util/i18n";

const formDataParser = bodyParser.urlencoded({ extended: false });
const maxLengthForInput = 120;

export default function translateController(app: Express) {
  app.get("/translate/:projectCode", async (req, res) => {
    const project = Manifest.readProjectManifest(
      decode(req.params.projectCode)
    );
    const t = i18n(project.sourceLang);
    res.send(
      layout(
        Mustache.render(getTemplate("translateIndex"), {
          lessons: project.lessons,
          t,
          baseUrl: req.url //`/translate/${req.params.projectCode}`
        })
      )
    );
  });

  app.get("/translate/:projectCode/lesson/:lesson", async (req, res) => {
    const project = Manifest.readProjectManifest(
      decode(req.params.projectCode)
    );
    const tStrings = Storage.getTStrings(project, req.params.lesson);
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

  // app.post(
  //   "/translate/:project/lesson/:code",
  //   formDataParser,
  //   async (req, res) => {
  //     try {
  //       storage.saveStrings(req.params.project, req.params.code, req.body);
  //       res.redirect(`/translate/${req.params.project}`);
  //     } catch (error) {
  //       console.error(error);
  //       res.status(500).send("Sorry, there was a problem.");
  //     }
  //   }
  // );
}

function stringInput() {
  if (this.src.length > maxLengthForInput) {
    return `<textarea name="${this.id}" rows="4">${this.targetText}</textarea>`;
  }
  return `<input type="text" name="${this.id}" value="${this.targetText}" />`;
}
