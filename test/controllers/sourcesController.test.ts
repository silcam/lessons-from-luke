import { loggedInAgent, resetTestStorage } from "../testHelper";

beforeAll(() => {
  resetTestStorage();
});

test("New Source Language", async () => {
  expect.assertions(1);
  const agent = await loggedInAgent();
  const response = await agent
    .post("/sources")
    .type("form")
    .send({ language: "Français" })
    .redirects(1);
  expect(response.text).toContain("<h2>Français</h2>");
});

test("Source Page", async () => {
  expect.assertions(1);
  const agent = await loggedInAgent();
  const response = await agent.get("/sources/English");
  expect(response.text).toContain("<h2>English</h2>");
});

test("uploadDoc", async () => {
  expect.assertions(1);
  const agent = await loggedInAgent();
  const response = await agent
    .post("/sources/English")
    .field("series", "Luke")
    .attach("document", "test/data/Q1-L01.odt")
    .redirects(1);
  expect(response.text).toContain("The Book of Luke and");
});

test("Update Src", async () => {
  resetTestStorage();
  expect.assertions(1);
  const agent = await loggedInAgent();
  await agent
    .post("/sources/English/lessons/Luke-Q1-L01/versions/1")
    .type("form")
    .send({ 0: "The Book of Luke and the Birth of John the Baptizer", 1: "" });
  const response = await agent.get(
    "/sources/English/lessons/Luke-Q1-L01/versions/2"
  );
  expect(response.text).toContain(
    "The Book of Luke and the Birth of John the Baptizer"
  );
});
