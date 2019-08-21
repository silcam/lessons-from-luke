import { loggedInAgent, resetTestStorage, plainAgent } from "../testHelper";

beforeAll(() => {
  resetTestStorage();
});

test("Download existing source doc", async () => {
  expect.assertions(2);
  const agent = await loggedInAgent();
  const response = await agent.get(
    "/documents/source/English_Luke-Q1-L01_1.odt"
  );
  expect(response.status).toBe(200);
  expect(response.type).toEqual("application/vnd.oasis.opendocument.text");
});

test("Generate and download source doc", async () => {
  expect.assertions(2);
  const agent = await loggedInAgent();
  // Create a version 2 of the doc
  await agent
    .post("/sources/English/lessons/Luke-Q1-L01/versions/1")
    .type("form")
    .send({})
    .redirects(1);
  const response = await agent.get(
    "/documents/source/English_Luke-Q1-L01_2.odt"
  );
  expect(response.status).toBe(200);
  expect(response.type).toEqual("application/vnd.oasis.opendocument.text");
});

test("Generate and download translated doc", async () => {
  expect.assertions(2);
  const agent = await plainAgent();
  const response = await agent.get(
    "/documents/translation/Pidgin_1555081479425/Luke-Q1-L01.odt"
  );
  expect(response.status).toBe(200);
  expect(response.type).toEqual("application/vnd.oasis.opendocument.text");
});
