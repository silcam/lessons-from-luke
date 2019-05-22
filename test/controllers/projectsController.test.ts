import { loggedInAgent, resetTestStorage } from "../testHelper";

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
