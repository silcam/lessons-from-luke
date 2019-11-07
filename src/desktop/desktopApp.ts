import express, { Response } from "express";
import layout from "../server/util/layout";
import translateController from "../server/controllers/translateController";
import catchError from "../server/util/catchError";
import handle404 from "../server/util/handle404";
import { getTemplate } from "../server/getTemplate";
import bodyParser from "body-parser";
// import {
//   fetch,
//   getUpSyncStatus,
//   push,
//   getDownSyncStatus,
//   fetchNextLesson,
//   unlock
// } from "./desktopSync";
import { encode } from "../core/util/timestampEncode";
import Mustache from "mustache";
import { assetsPath } from "../core/util/fsUtils";
import i18n, { languages } from "../core/util/i18n";

const formDataParser = bodyParser.urlencoded({ extended: false });

const app = express();
app.use(express.static(assetsPath("public")));

// app.use((req, res, next) => {
//   const syncStatus = getUpSyncStatus();
//   if (syncStatus.writeLockInvalid) {
//     res.send(
//       layout(
//         Mustache.render(getTemplate("errorPage"), {
//           messages: languages().map(lang => i18n(lang).writeLockInvalid),
//           showOk: false
//         })
//       )
//     );
//   } else {
//     next();
//   }
// });

// app.get("/", async (req, res) => {
//   if (getDownSyncStatus() !== null) {
//     res.redirect("/syncProgress");
//   } else if (desktopProjectManifestExists()) {
//     const upSyncStatus = getUpSyncStatus();
//     if (upSyncStatus.needToSync.length > 0)
//       await push(upSyncStatus.needToSync[0]);
//     redirectToProject(res);
//   } else {
//     const errorMessage = req.query.failedSync ? "Sorry, that didn't work." : "";
//     res.send(
//       layout(Mustache.render(getTemplate("desktopHome"), { errorMessage }))
//     );
//   }
// });

// app.get("/syncProgress", async (req, res) => {
//   const syncStatus = getDownSyncStatus();
//   if (syncStatus === null) {
//     res.redirect("/");
//   } else {
//     res.send(
//       layout(
//         Mustache.render(getTemplate("downSyncProgress"), {
//           t: i18n(syncStatus.project.sourceLang),
//           error: (!!req.query.error).toString(),
//           percent: Math.round(
//             (100 * syncStatus.gotLessons.length) /
//               (syncStatus.gotLessons.length + syncStatus.neededLessons.length)
//           ),
//           lessons: syncStatus.gotLessons
//             .map(lesson => ({ name: lesson, done: true }))
//             .concat(
//               syncStatus.neededLessons.map(lesson => ({
//                 name: lesson,
//                 done: false
//               }))
//             )
//         })
//       )
//     );
//   }
// });

app.post("/fetch", formDataParser, async (req, res) => {
  const codeOrUrl: string = req.body.code;
  const code = codeOrUrl.includes("/")
    ? codeOrUrl.substr(codeOrUrl.lastIndexOf("/") + 1)
    : codeOrUrl;
  try {
    await fetch(code);
    res.redirect("/syncProgress");
  } catch (err) {
    console.error(err);
    res.redirect("/?failedSync=true");
  }
});

// app.get("/fetchLesson", async (req, res) => {
//   try {
//     const done = await fetchNextLesson();
//     const redirect = done ? "/" : "/syncProgress";
//     res.redirect(redirect);
//   } catch (err) {
//     res.redirect("/syncProgress?error=true");
//   }
// });

// app.post("/unlock", async (req, res) => {
//   try {
//     await unlock();
//     res.redirect("/");
//   } catch (err) {
//     const message = typeof err === "string" ? err : "UnknownError";
//     res.redirect(`/error?message=${message}`);
//   }
// });

app.get("/error", async (req, res) => {
  const error = req.query.message || "UnknownError";
  res.send(
    layout(
      Mustache.render(getTemplate("errorPage"), {
        messages: languages().map(lang => {
          const t = i18n(lang);
          return t[error] || t.UnknownError;
        }),
        showOk: true
      })
    )
  );
});

translateController(app, "desktop");

app.use(handle404);

app.use(catchError);

// function redirectToProject(res: Response) {
//   const project = Manifest.readDesktopProject();
//   res.redirect(`/translate/${encode(project.datetime)}`);
// }

export default app;
