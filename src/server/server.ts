import serverApp from "./serverApp";
import { reseedServerDocsRunDir } from "./storage/seedServerDocs";

// The e2e/dev-server boot under NODE_ENV=test (yarn serve, Cypress, Playwright)
// starts each run from a pristine copy of the ODT corpus, so uploads never
// touch the git-tracked fixture dir. Deliberately here and NOT in serverApp(),
// which testHelper.ts instantiates per jest test file — a wipe there would race
// across workers.
if (process.env.NODE_ENV === "test") reseedServerDocsRunDir();

const app = serverApp();

app.listen(8081, function () {
  console.log(
    `Lessons from Luke API listening on port 8081.\nNode environment is ${process.env.NODE_ENV?.toLocaleUpperCase()}`
  );
});
