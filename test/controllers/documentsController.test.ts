import { loggedInAgent } from "../testHelper";

test("Download existing source doc", async () => {
  expect.assertions(2);
  const agent = await loggedInAgent();
  const response = await agent.get("/documents/source/English_Luke-Q1-L01_1");
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
  const response = await agent.get("/documents/source/English_Luke-Q1-L01_2");
  expect(response.status).toBe(200);
  expect(response.type).toEqual("application/vnd.oasis.opendocument.text");
});
