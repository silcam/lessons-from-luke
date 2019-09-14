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

test("Upload USFM", async () => {
  const agent = await loggedInAgent();
  const response = await agent
    .post("/projects/Pidgin_1555081479425/usfm")
    .attach("usfmFile", "test/data/43LUKBMO.SFM");
  expect(response.text).toContain(
    '<td class="diff diff-new">Luke 1:5-7 A ni mbɔ thɔ Hɛrɔ, mbɔ fùoŋ Judia, yichəɨ ŋgaŋ fɛʼiŋgiɛŋ Minnwi ni mbɔ fɔ, ligi yi pɔ Shakaria. A ni ndhɔ moŋ ghrà ghaŋ fɛʼiŋgiɛŋ Minnwi, llɔ moŋ ndaaŋoŋ Abija. A ni mfāʼo ŋgwɛ vi llɔ moŋ ŋgwrɛiŋoŋ Ɛroŋ, ligi yi ni mbɔ Ɛlishabe. Ŋguoŋ vugu ni mbɔ ŋgwa ndɨndɨ shhɨ Minnwi, nthɔ nūʼɔŋ ŋguoŋ kɨ̀na pugu pa gɨ́ Taathɔ ndɔ ki lɔ mfāʼo ntəɨ. Ndɔ paʼa pugu lɔ njiʼi fāʼo muuŋ, nthɛ ŋa Ɛlishabe ni mbɔ pi ŋkhwɛ̄, ndɔ pugu ni ŋkwo ya ndunu.</td>'
  );
});
