import { resetTestStorage, loggedInAgent } from "../testHelper";
import app from "../../src/app";
import request from "supertest";
import { Project } from "../../src/util/Manifest";
import { UpSyncPackage, UnlockPackage } from "../../src/util/desktopSync";
import { TDocString } from "../../src/util/Storage";
import * as Manifest from "../../src/util/Manifest";

/*************
  These tests are for the API used by the Desktop app,
  and must not be changed after the initial release of the Desktop app!
*/

beforeEach(() => {
  resetTestStorage();
});

test("Initial Fetch and Fetch Lesson", async () => {
  expect.assertions(4);
  const time = Date.now().valueOf();
  let response = await request(app).get("/desktop/fetch/TPINTII");
  const project: Project = JSON.parse(response.text);
  const { lockCode, ...projectRest } = project;
  expect(parseInt(lockCode!)).toBeGreaterThanOrEqual(time);
  expect(projectRest).toEqual({
    targetLang: "Pidgin",
    datetime: 1555081479425,
    sourceLang: "English",
    lessons: [{ lesson: "Luke-Q1-L01", version: 1 }]
  });

  response = await request(app).get(
    "/desktop/fetch/1555081479425/lesson/Luke-Q1-L01"
  );
  expect(response.status).toBe(403); // Should be unauthorized without lockCode

  response = await request(app).get(
    `/desktop/fetch/1555081479425/lesson/Luke-Q1-L01?lockCode=${lockCode}`
  );
  const tStrings: TDocString[] = JSON.parse(response.text);
  expect(tStrings[0]).toEqual({
    id: 0,
    xpath:
      "/office:document-content/office:body/office:text/table:table[1]/table:table-row/table:table-cell[2]/text:p[1]/text()[1]",
    src: "The Book of Luke and",
    targetText: "",
    mtString: true
  });
});

test("Can't fetch locked project", async () => {
  expect.assertions(1);

  // First fetch locks the project
  await request(app).get("/desktop/fetch/TPINTII");

  // Second fetch should not work
  const response = await request(app).get("/desktop/fetch/TPINTII");
  expect(response.status).toEqual(403);
});

test("Push translations", async () => {
  expect.assertions(2);
  let response = await request(app).get("/desktop/fetch/TPINTII");
  const project: Project = JSON.parse(response.text);

  response = await request(app).get(
    `/desktop/fetch/1555081479425/lesson/Luke-Q1-L01?lockCode=${project.lockCode}`
  );
  const tStrings: TDocString[] = JSON.parse(response.text);

  // Simulate translating (In real life, the progress element of each lesson in the project object would be updated, but that's not necessary for the API)
  tStrings.forEach(tString => {
    tString.targetText = tString.src.toLocaleUpperCase();
  });

  const syncPackage: UpSyncPackage = {
    project,
    lesson: {
      lesson: "Luke-Q1-L01",
      strings: tStrings
    }
  };
  response = await request(app)
    .put("/desktop/push")
    .send(syncPackage);
  expect(response.status).toBe(204);

  const agent = await loggedInAgent();
  response = await agent.get("/projects/Pidgin_1555081479425");
  expect(response.text).toContain("100%");
});

test("Can't push if the lock does not match", async () => {
  expect.assertions(1);
  let response = await request(app).get("/desktop/fetch/TPINTII");
  const project: Project = JSON.parse(response.text);
  project.lockCode = "1234";
  const syncPackage: UpSyncPackage = {
    project,
    lesson: {
      lesson: "Luke-Q1-L01",
      strings: []
    }
  };

  response = await request(app)
    .put("/desktop/push")
    .send(syncPackage);
  expect(response.status).toBe(403);
});

test("Unlock project", async () => {
  expect.assertions(4);
  let response = await request(app).get("/desktop/fetch/TPINTII");
  let project: Project = JSON.parse(response.text);

  // Unlock rejected if project is locked and the lock code is wrong
  const body: UnlockPackage = {
    datetime: project.datetime,
    lockCode: "1234" // Wrong
  };
  response = await request(app)
    .post("/desktop/unlock")
    .send(body);
  expect(response.status).toBe(403);

  // Unlock works with correct code
  body.lockCode = project.lockCode!;
  response = await request(app)
    .post("/desktop/unlock")
    .send(body);
  expect(response.status).toBe(204);
  // Verify unlocked
  project = Manifest.readProjectManifest(1555081479425);
  expect(project.lockCode).toBeUndefined();

  // Unlock returns 204 if the project was already unlocked
  response = await request(app)
    .post("/desktop/unlock")
    .send(body);
  expect(response.status).toBe(204);
});
