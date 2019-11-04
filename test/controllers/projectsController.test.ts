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
    .send({
      sourceLang: "English",
      targetLang: "Canadian"
    })
    .redirects(1);
  expect(response.text).toMatch(/Canadian.+Full Translations/s); // Canadian project should be above the header for Full Translations
});

test("Create full Translation", async () => {
  expect.assertions(1);
  const agent = await loggedInAgent();
  const response = await agent
    .post("/projects")
    .type("form")
    .send({
      sourceLang: "English",
      targetLang: "Canadian",
      fullTranslation: true
    })
    .redirects(1);
  expect(response.text).toMatch(/Full Translations.+Canadian/s); // Canadian project should be below the header for Full Translations
});

test("Show Project, Project Lesson and Project Lesson History", async () => {
  expect.assertions(3);
  const agent = await loggedInAgent();
  let response = await agent.get("/projects/Pidgin_1555081479425");
  expect(response.text).toContain(`<div id="project">`);

  await agent
    .post("/translate-api/TPINTII/lesson/Luke-Q1-L01")
    .send([{ id: 0, targetText: "Version 1" }]);
  await agent
    .post("/translate-api/TPINTII/lesson/Luke-Q1-L01")
    .send([{ id: 0, targetText: "Version 2" }]);
  response = await agent.get(
    "/projects/Pidgin_1555081479425/lessons/Luke-Q1-L01"
  );
  expect(response.text).toContain("<td>Version 2</td>");

  response = await agent.get(
    "/projects/Pidgin_1555081479425/lessonHistory/Luke-Q1-L01"
  );
  expect(response.text).toContain("<td>Version 1</td>");
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
  expect.assertions(1);
  const agent = await loggedInAgent();
  const response = await agent
    .post("/projects/Pidgin_1555081479425/usfm")
    .attach("usfmFile", "test/data/43LUKBMO.SFM");
  expect(response.text).toContain(
    '<td class="diff diff-new">Luka 1:5-7 A ni mbɔ thɔ Hɛrɔ, mbɔ fùoŋ Judia, yichəɨ ŋgaŋ fɛʼiŋgiɛŋ Minnwi ni mbɔ fɔ, ligi yi pɔ Shakaria. A ni ndhɔ moŋ ghrà ghaŋ fɛʼiŋgiɛŋ Minnwi, llɔ moŋ ndaaŋoŋ Abija. A ni mfāʼo ŋgwɛ vi llɔ moŋ ŋgwrɛiŋoŋ Ɛroŋ, ligi yi ni mbɔ Ɛlishabe. Ŋguoŋ vugu ni mbɔ ŋgwa ndɨndɨ shhɨ Minnwi, nthɔ nūʼɔŋ ŋguoŋ kɨ̀na pugu pa gɨ́ Taathɔ ndɔ ki lɔ mfāʼo ntəɨ. Ndɔ paʼa pugu lɔ njiʼi fāʼo muuŋ, nthɛ ŋa Ɛlishabe ni mbɔ pi ŋkhwɛ̄, ndɔ pugu ni ŋkwo ya ndunu.</td>'
  );
});

test("Update Project Lesson", async () => {
  expect.assertions(2);
  const agent = await loggedInAgent();

  // // Translate a bit
  // await agent
  //   .post("/translate-api/TPINTII/lesson/Luke-Q1-L01")
  //   .send([
  //     { id: 0, targetText: "Da book o Luke an" },
  //     { id: 1, targetText: "Da Burt o Jon dat Baptizah" }
  //   ]);

  // Create a new version of lesson 1
  await agent
    .post("/sources/English/lessons/Luke-Q1-L01/versions/1")
    .type("form")
    .send({ 0: "The Book of Luke and John the Baptists Birth", 1: "" });

  // Load update page
  let response = await agent.get("/projects/Pidgin_1555081479425/update");
  expect(response.text).toContain(
    `<div class="src">The Book of Luke and John the Baptists Birth`
  );

  // Post data for update
  await agent
    .post("/projects/Pidgin_1555081479425/update/0")
    .type("form")
    .send({
      targetVersion: "2",
      0: "Da book o Luke an da Burt o Jon dat Baptizah"
    });

  // Check that update succeeded
  response = await agent.get(
    "/projects/Pidgin_1555081479425/lessons/Luke-Q1-L01"
  );
  expect(response.text).toContain(
    "Da book o Luke an da Burt o Jon dat Baptizah"
  );
});
