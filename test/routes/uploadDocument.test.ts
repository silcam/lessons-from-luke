import { loggedInAgent, resetTestStorage } from "../testHelper";

beforeAll(() => {
  resetTestStorage();
});

test("uploadDoc : invalid language", async () => {
  expect.assertions(1);
  const agent = await loggedInAgent();
  const response = await agent
    .post("/documents")
    .field("language", "")
    .attach("document", "test/data/Q1-L01.odt")
    .redirects(1);
  expect(response.text).toContain("Language can&#39;t be blank.");
});

test("uploadDoc : invalid file", async () => {
  expect.assertions(1);
  const agent = await loggedInAgent();
  const response = await agent
    .post("/documents")
    .field("language", "English")
    .attach("document", null)
    .redirects(1);
  expect(response.text).toContain("No file was attached.");
});

test("uploadDoc", async () => {
  expect.assertions(1);
  const agent = await loggedInAgent();
  const response = await agent
    .post("/documents")
    .field("language", "English")
    .attach("document", "test/data/Q1-L01.odt")
    .redirects(1);
  expect(response.text).toContain("The Book of Luke and");
});
