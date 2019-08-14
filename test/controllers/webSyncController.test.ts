import { resetTestStorage, loggedInAgent } from "../testHelper";
import app from "../../src/app";
import request from "supertest";
import { SyncPackage } from "../../src/util/desktopSync";

/*************
  These tests are for the API used by the Desktop app,
  and must not be changed after the initial release of the Desktop app!
*/

beforeEach(() => {
  resetTestStorage();
});

test("Initial Fetch", async () => {
  expect.assertions(4);
  const time = Date.now().valueOf();
  const response = await request(app).get("/desktop/fetch/TPINTII");
  const syncData: SyncPackage = JSON.parse(response.text);
  const { lockCode, ...project } = syncData.project;
  expect(parseInt(lockCode!)).toBeGreaterThanOrEqual(time);
  expect(project).toEqual({
    targetLang: "Pidgin",
    datetime: 1555081479425,
    sourceLang: "English",
    lessons: [{ lesson: "Luke-Q1-L01", version: 1 }]
  });
  expect(syncData.lessons[0].lesson).toEqual("Luke-Q1-L01");
  expect(syncData.lessons[0].strings[0]).toEqual({
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
  const syncData: SyncPackage = JSON.parse(response.text);

  // Simulate translating (In real life, the progress element of each lesson in the project object would be updated, but that's not necessary for the API)
  syncData.lessons[0].strings.forEach(tString => {
    tString.targetText = tString.src.toLocaleUpperCase();
  });
  response = await request(app)
    .put("/desktop/push")
    .send(syncData);
  expect(response.status).toBe(204);

  const agent = await loggedInAgent();
  response = await agent.get("/projects/Pidgin_1555081479425");
  expect(response.text).toContain("100%");
});

test("Can't push if the lock does not match", async () => {
  expect.assertions(1);
  let response = await request(app).get("/desktop/fetch/TPINTII");
  const syncData: SyncPackage = JSON.parse(response.text);
  syncData.project.lockCode = "1234";

  response = await request(app)
    .put("/desktop/push")
    .send(syncData);
  expect(response.status).toBe(403);
});