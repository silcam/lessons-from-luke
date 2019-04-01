import express from "express";
// import layout from "./layout";
import adminHome from "./routes/adminHome";
import publicHome from "./routes/publicHome";
// import viewProject from "./routes/viewProject";
// import index from "./routes/index";
// import lesson from "./routes/lesson";
import cookieSession from "cookie-session";
import bodyParser from "body-parser";
// import storage from "./util/storage";
import path from "path";
import secrets from "./util/secrets";
import authenticate from "./util/authenticate";
// import createProject from "./util/createProject";
import Mustache from "mustache";
import fs from "fs";
import fileUpload, { UploadedFile } from "express-fileupload";
import requireAdmin, { isAdmin } from "./util/requireAdmin";
import uploadDocument, {
  validateUploadDocument
} from "./routes/uploadDocument";
import layout from "./util/layout";
import * as Storage from "./util/Storage";
import docStrings from "./routes/docStrings";

const app = express();
app.use(express.static("public"));
app.use(cookieSession({ secret: secrets.cookieSecret }));
const formDataParser = bodyParser.urlencoded({ extended: false });

app.get("/", async (req, res) => {
  if (isAdmin(req)) res.send(layout(adminHome()));
  else res.send(layout(publicHome(req.query)));
});

app.post("/login", formDataParser, async (req, res) => {
  if (authenticate(req.body)) {
    req.session.admin = true;
    res.redirect("/");
  } else {
    res.redirect("/?failedLogin=true");
  }
});

app.post(
  "/documents",
  requireAdmin,
  formDataParser,
  fileUpload(),
  validateUploadDocument,
  async (req, res) => {
    const file = req.files.document as UploadedFile;
    const lessonId = await uploadDocument(req.body.language, file);
    res.redirect(`/documents/${Storage.lessonIdToString(lessonId)}`);
  }
);

app.get("/documents/:lessonId", requireAdmin, async (req, res) => {
  res.send(layout(docStrings(Storage.lessonIdFromString(req.params.lessonId))));
});

// app.post("/create", formDataParser, async (req, res) => {
//   if (isAdmin(req)) {
//     createProject(req.body);
//     res.redirect("/");
//   } else {
//     res.redirect("/");
//   }
// });

// app.get("/view/:project", async (req, res) => {
//   res.send(layout(viewProject()));
// });

// app.get("/translate/:project", async (req, res) => {
//   res.send(layout(index(req.params.project)));
// });

// app.get("/translate/:project/lesson/:lesson", async (req, res) => {
//   res.send(layout(lesson(req.params.project, req.params.code)));
// });

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

export default app;
