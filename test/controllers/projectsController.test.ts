import { loggedInAgent, resetTestStorage, plainAgent } from "../testHelper";

beforeAll(() => {
  resetTestStorage();
});

test("Create a project", async () => {
  expect.assertions(1);
  const agent = await loggedInAgent();
  const response = await agent
    .post("/projects")
    .type("form")
    .send({ sourceLang: "English", targetLang: "Canadian" })
    .redirects(1);
  expect(response.text).toContain("Canadian");
});

test("Show Project", async () => {
  expect.assertions(1);
  const agent = await loggedInAgent();
  const response = await agent.get("/projects/Pidgin_1555081479425");
  expect(response.text).toContain(`<div id="project">`);
});

test("Unlock project", async () => {
  expect.assertions(2);
  const desktopAgent = plainAgent();
  const adminAgent = await loggedInAgent();

  let response = await desktopAgent.get("/desktop/fetch/TPINTII"); // Locks the project
  response = await adminAgent.get("/projects/Pidgin_1555081479425");
  expect(response.text).toContain('<div data-show="true" class="unlock">');

  response = await adminAgent
    .post("/projects/Pidgin_1555081479425/unlock")
    .redirects(1);
  expect(response.text).toContain('<div data-show="false" class="unlock">');
});
