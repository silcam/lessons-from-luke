import { loggedInAgent } from "../testHelper";

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
