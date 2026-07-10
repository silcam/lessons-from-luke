describe("US13: Upload English cover masters", () => {
  beforeEach(cy.login);

  // GIVEN the English-document upload page WHEN the operator selects
  // English-Luke-Q1-Cover-A4.odt THEN the form pre-selects book Luke, series 1,
  // cover format A4, with a visible manual override control.
  it("pre-selects book, series, and cover format from a Q-series cover filename", () => {
    cy.visit("/");
    cy.contains("button", "Add Lesson").click();
    cy.fixture("English-Luke-Q1-Cover-A4.odt", "base64").then((fileContent) => {
      cy.get("input[type='file']").selectFile(
        {
          contents: Cypress.Buffer.from(fileContent, "base64"),
          fileName: "English-Luke-Q1-Cover-A4.odt",
          mimeType: "application/vnd.oasis.opendocument.text",
        },
        { action: "drag-drop", force: true }
      );
    });
    cy.contains("button", "English-Luke-Q1-Cover-A4.odt").should("exist");
    cy.inLabel("Book").should("have.value", "Luke");
    cy.inLabel("Series").should("have.value", "1");
    cy.inLabel("Cover format").should("have.value", "A4");
    // Manual override control for cover detection/format/series.
    cy.contains("label", "Cover").should("exist");
  });

  // GIVEN a cover master filename using the T series prefix
  // (English-Luke-T1-Cover-A4.odt) WHEN selected THEN series is detected
  // identically to the Q-prefix form.
  it("detects series identically for a T-series cover filename", () => {
    cy.visit("/");
    cy.contains("button", "Add Lesson").click();
    cy.fixture("English-Luke-T1-Cover-A4.odt", "base64").then((fileContent) => {
      cy.get("input[type='file']").selectFile(
        {
          contents: Cypress.Buffer.from(fileContent, "base64"),
          fileName: "English-Luke-T1-Cover-A4.odt",
          mimeType: "application/vnd.oasis.opendocument.text",
        },
        { action: "drag-drop", force: true }
      );
    });
    cy.contains("button", "English-Luke-T1-Cover-A4.odt").should("exist");
    cy.inLabel("Book").should("have.value", "Luke");
    cy.inLabel("Series").should("have.value", "1");
    cy.inLabel("Cover format").should("have.value", "A4");
  });

  // GIVEN a valid cover master upload WHEN processing completes THEN title,
  // subtitle, copyright line, and publisher address lines are all extracted
  // as translatable strings.
  it("extracts title, subtitle, copyright, and publisher address as translatable strings", () => {
    cy.visit("/");
    cy.contains("button", "Add Lesson").click();
    cy.fixture("English-Luke-Q1-Cover-A4.odt", "base64").then((fileContent) => {
      cy.get("input[type='file']").selectFile(
        {
          contents: Cypress.Buffer.from(fileContent, "base64"),
          fileName: "English-Luke-Q1-Cover-A4.odt",
          mimeType: "application/vnd.oasis.opendocument.text",
        },
        { action: "drag-drop", force: true }
      );
    });
    cy.inLabel("Cover format").select("A4");
    cy.intercept("POST", "/api/admin/documents").as("uploadCover");
    cy.contains("button", "Save").click();
    cy.wait("@uploadCover", { timeout: 30000 });
    cy.contains("h2", "No issues").should("exist");
    cy.contains("button", "View Lesson").click();
    cy.contains("Lessons from Luke").should("exist");
    cy.contains("Guide moniteur", { matchCase: false }).should("exist");
    cy.contains("Publisher").should("exist");
    cy.contains("Publisher address").should("exist");
  });

  // GIVEN an uploaded A4 cover for Luke series 1 WHEN the operator views
  // document/lesson lists THEN it displays as "Cover (A4)", never as a bare
  // lesson number.
  it("displays uploaded covers as 'Cover (A4)', never as a bare lesson number", () => {
    cy.visit("/");
    cy.contains("button", "Add Lesson").click();
    cy.fixture("English-Luke-Q1-Cover-A4.odt", "base64").then((fileContent) => {
      cy.get("input[type='file']").selectFile(
        {
          contents: Cypress.Buffer.from(fileContent, "base64"),
          fileName: "English-Luke-Q1-Cover-A4.odt",
          mimeType: "application/vnd.oasis.opendocument.text",
        },
        { action: "drag-drop", force: true }
      );
    });
    cy.inLabel("Cover format").select("A4");
    cy.intercept("POST", "/api/admin/documents").as("uploadCover");
    cy.contains("button", "Save").click();
    cy.wait("@uploadCover", { timeout: 30000 });

    cy.visit("/");
    cy.contains("a", "Cover (A4)").should("exist");
    cy.contains("a", "Luke 1-97").should("not.exist");
    cy.contains("a", "97").should("not.exist");
  });
});

describe("US14: Cover text auto-populates from existing translations", () => {
  beforeEach(cy.login);

  function uploadCover(fixtureName: string, format: "A4" | "A3") {
    cy.visit("/");
    cy.contains("button", "Add Lesson").click();
    cy.fixture(fixtureName, "base64").then((fileContent) => {
      cy.get("input[type='file']").selectFile(
        {
          contents: Cypress.Buffer.from(fileContent, "base64"),
          fileName: fixtureName,
          mimeType: "application/vnd.oasis.opendocument.text",
        },
        { action: "drag-drop", force: true }
      );
    });
    cy.inLabel("Cover format").select(format);
    cy.intercept("POST", "/api/admin/documents").as("uploadCover");
    cy.contains("button", "Save").click();
    cy.wait("@uploadCover", { timeout: 30000 });
  }

  // GIVEN a language with the title and "Teacher's Guide" already translated
  // via the Table of Contents WHEN a cover master is uploaded THEN those
  // cover strings show the existing translations with no translator action.
  it("shows a cover's shared title in Français already-translated, with no translator action, once uploaded", () => {
    // GIVEN: the A4 cover carries the title text "Lessons from Luke", which
    // this test translates into Français before the A3 cover — sharing that
    // identical English text — is ever uploaded (standing in for a title
    // already translated via the Table of Contents).
    uploadCover("English-Luke-Q1-Cover-A4.odt", "A4");
    cy.request("GET", "/api/lessons").then(({ body: lessons }) => {
      const a4 = lessons.find(
        (l: { book: string; series: number; lesson: number }) =>
          l.book === "Luke" && l.series === 1 && l.lesson === 97
      );
      cy.request("GET", `/api/languages/1/lessons/${a4.lessonId}/tStrings`).then(
        ({ body: engStrings }) => {
          const titleMaster = engStrings.find(
            (ts: { text: string }) => ts.text === "Lessons from Luke"
          );
          expect(Boolean(titleMaster), "title master string exists in English").to.eq(true);
          cy.request("POST", "/api/tStrings", {
            code: "DEF",
            tStrings: [
              { masterId: titleMaster.masterId, languageId: 2, text: "Leçons de Luc", history: [] },
            ],
          });
        }
      );
    });

    // WHEN: the A3 cover master — sharing the same title text — is uploaded.
    uploadCover("English-Luke-Q1-Cover-A3.odt", "A3");

    // THEN: viewing the A3 cover in the Français translation UI already
    // shows the translated title — no translator action was taken on it.
    cy.visit("/translate/DEF");
    cy.contains("button", "Cover (A3)").click();
    cy.get("span.lessonString", { timeout: 20000 }).should("exist");
    cy.contains("span.lessonString", "Leçons de Luc").should("exist");
  });

  // GIVEN an untranslated cover-only string such as the copyright line WHEN
  // the translator translates it in the normal translation UI THEN the
  // translation is saved and remains editable like any other string.
  it("lets the copyright line be translated once through the normal translation UI, and remains editable", () => {
    uploadCover("English-Luke-Q1-Cover-A4.odt", "A4");

    cy.visit("/translate/DEF");
    cy.contains("button", "Cover (A4)").click();
    cy.get("span.lessonString", { timeout: 20000 }).should("exist");

    // WHEN the translator clicks the untranslated copyright line and types a
    // translation into the normal per-string textarea.
    cy.contains("span.lessonString", "Year of Publication").click();
    cy.get("textarea").clear().type("© 2024 Mission Publishers", { delay: 0 });
    cy.contains("Unsaved Changes").should("exist");
    cy.intercept("POST", "/api/tStrings").as("saveCopyright");
    cy.contains("button", "Save").click();
    cy.wait("@saveCopyright");
    cy.contains("Changes Saved").should("exist");

    // THEN it saved, and remains an ordinary, editable string afterward.
    cy.visit("/translate/DEF");
    cy.contains("button", "Cover (A4)").click();
    cy.contains("span.lessonString", "© 2024 Mission Publishers").click();
    cy.get("textarea").should("have.value", "© 2024 Mission Publishers");
  });

  // GIVEN a translated copyright line WHEN the publication year changes
  // THEN the translator updates it as an ordinary string edit with no
  // special workflow.
  it("updates a translated copyright line as an ordinary edit when the publication year changes", () => {
    uploadCover("English-Luke-Q1-Cover-A4.odt", "A4");

    // GIVEN: the copyright line is already translated.
    cy.request("GET", "/api/lessons").then(({ body: lessons }) => {
      const a4 = lessons.find(
        (l: { book: string; series: number; lesson: number }) =>
          l.book === "Luke" && l.series === 1 && l.lesson === 97
      );
      cy.request("GET", `/api/languages/1/lessons/${a4.lessonId}/tStrings`).then(
        ({ body: engStrings }) => {
          const copyrightMaster = engStrings.find((ts: { text: string }) =>
            ts.text.includes("Year of Publication")
          );
          expect(Boolean(copyrightMaster), "copyright master string exists in English").to.eq(true);
          cy.request("POST", "/api/tStrings", {
            code: "DEF",
            tStrings: [
              {
                masterId: copyrightMaster.masterId,
                languageId: 2,
                text: "© 2024 Mission Publishers",
                history: [],
              },
            ],
          });
        }
      );
    });

    // WHEN the translator updates the publication year — an ordinary edit
    // through the same textarea/Save mechanism as any other string.
    cy.visit("/translate/DEF");
    cy.contains("button", "Cover (A4)").click();
    cy.contains("span.lessonString", "© 2024 Mission Publishers").click();
    cy.get("textarea").clear().type("© 2025 Mission Publishers", { delay: 0 });
    cy.intercept("POST", "/api/tStrings").as("saveCopyrightEdit");
    cy.contains("button", "Save").click();
    cy.wait("@saveCopyrightEdit");
    cy.contains("Changes Saved").should("exist");

    // THEN the new year is saved, with no special workflow beyond an
    // ordinary string edit.
    cy.visit("/translate/DEF");
    cy.contains("button", "Cover (A4)").click();
    cy.contains("span.lessonString", "© 2025 Mission Publishers").should("exist");
    cy.contains("span.lessonString", "© 2024 Mission Publishers").should("not.exist");
  });
});
