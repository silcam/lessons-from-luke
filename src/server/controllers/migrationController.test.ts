/// <reference types="jest" />

import { loggedInAgent } from "../testHelper";

// Don't really need these anymore

test.skip("Get legacy Project list", async () => {
  const agent = await loggedInAgent();
  const response = await agent.get("/api/admin/legacy/projects");
  expect(response.status).toBe(200);
  expect(response.body[1]).toMatchObject({
    targetLang: "Iyasa",
    datetime: 1566208871245,
    sourceLang: "Français"
  });
});

// Long test ~13 seconds
test.skip("Get legacy project", async () => {
  const agent = await loggedInAgent();
  const response = await agent.get("/api/admin/legacy/project/1566208871245");
  expect(response.status).toBe(200);
  expect(response.body.exactLegacyStrings.length).toBe(57);
  expect(response.body.exactLegacyStrings[0]).toEqual({
    id: 1,
    mtString: true,
    src: "Le livre de Luc et la naissance de Jean Baptiste",
    targetText: "Kálati a Lúkasi na ijáwɛ já Yowanɛ́si mobatiini",
    xpath:
      "/office:document-content/office:body/office:text/table:table[1]/table:table-row/table:table-cell[2]/text:p[1]/text()",
    matches: [
      {
        history: [],
        languageId: 2,
        masterId: 2,
        text: "Le livre de Luc et la naissance de Jean Baptiste"
      }
    ]
  });
  expect(response.body.legacyStrings.length).toBe(55);
  expect(response.body.legacyStrings[0]).toMatchObject({
    id: 32,
    mtString: true,
    src: "Qu'est ce que Dieu a fait pour toi?",
    targetText: "Endéndí a Anyámbɛ á sá éaláev̀ɛ?",
    xpath:
      "/office:document-content/office:body/office:text/text:list[2]/text:list-item/text:p/text()[1]"
  });
  expect(response.body.legacyStrings[0].matches[0]).toEqual({
    history: [],
    languageId: 2,
    masterId: 7376,
    text: "Va et raconte à quelqu'un ce que Dieu a fait pour toi."
  });

  // expect(response.legacy)
}, 15000);
