import { loggedInAgent } from "../testHelper";
import { ENGLISH_ID } from "../../core/models/Language";

test("Upload new English Lesson", async () => {
  expect.assertions(2);
  const agent = await loggedInAgent();
  const response = await agent
    .post("/api/admin/documents")
    .field("languageId", ENGLISH_ID)
    .field("book", "Luke")
    .field("series", 1)
    .field("lesson", 6)
    .attach("document", "test/docs/English_Luke-Q1-L06.odt");
  expect(response.status).toBe(200);
  expect(response.body[2]).toMatchObject({
    type: "content",
    motherTongue: true,
    text: "Review Lesson",
    xpath:
      "/office:document-content/office:body/office:text/table:table/table:table-row/table:table-cell[2]/text:p[1]/text()"
  });
});

test("Upload French version", async () => {
  expect.assertions(5);
  const agent = await loggedInAgent();
  const response = await agent
    .post("/api/admin/documents")
    .field("languageId", 2)
    .field("lessonId", 11)
    .attach("document", "test/docs/Français_Luke-T1-L01.odt");
  expect(response.status).toBe(200);
  expect(response.body.docStrings[1]).toEqual({
    motherTongue: true,
    text: "Le livre de Luc et la naissance de Jean Baptiste",
    type: "content",
    xpath:
      "/office:document-content/office:body/office:text/table:table[1]/table:table-row/table:table-cell[2]/text:p[1]/text()"
  });
  expect(response.body.lesson).toMatchObject({ lessonId: 11 });
  expect(response.body.lesson.lessonStrings[0]).toMatchObject({
    lessonStringId: 1
  });
  expect(response.body.tStrings[0]).toMatchObject({
    masterId: 1,
    languageId: 1
  });
});
