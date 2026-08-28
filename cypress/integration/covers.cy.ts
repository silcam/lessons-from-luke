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
    // The lesson picker only renders once all three requests that gate
    // TranslateHome's loading state resolve (loadTranslatingLanguage,
    // loadLessons, loadLanguages) — wait for them before clicking so we
    // don't click into a list that's still reflowing while data lands.
    cy.intercept("GET", "/api/languages/code/DEF").as("translatingLanguage1");
    cy.intercept("GET", "/api/lessons").as("lessons1");
    cy.intercept("GET", "/api/languages").as("languages1");
    cy.visit("/translate/DEF");
    cy.wait(["@translatingLanguage1", "@lessons1", "@languages1"]);
    cy.contains("button", "Cover (A3)").should("be.visible").click();
    cy.contains("div", "Lessons from Luke", { timeout: 20000 })
      .parent()
      .find("textarea")
      .should("have.value", "Leçons de Luc");
  });

  // GIVEN an untranslated cover-only string such as the copyright line WHEN
  // the translator translates it in the normal translation UI THEN the
  // translation is saved and remains editable like any other string.
  it("lets the copyright line be translated once through the normal translation UI, and remains editable", () => {
    uploadCover("English-Luke-Q1-Cover-A4.odt", "A4");

    // The lesson picker only renders once all three requests that gate
    // TranslateHome's loading state resolve (loadTranslatingLanguage,
    // loadLessons, loadLanguages) — wait for them before clicking so we
    // don't click into a list that's still reflowing while data lands.
    cy.intercept("GET", "/api/languages/code/DEF").as("translatingLanguage2");
    cy.intercept("GET", "/api/lessons").as("lessons2");
    cy.intercept("GET", "/api/languages").as("languages2");
    cy.visit("/translate/DEF");
    cy.wait(["@translatingLanguage2", "@lessons2", "@languages2"]);
    cy.contains("button", "Cover (A4)").should("be.visible").click();

    // WHEN the translator types a translation into the untranslated
    // copyright line's per-string textarea.
    cy.contains("div", "Year of Publication", { timeout: 20000 })
      .parent()
      .find("textarea")
      .clear()
      .type("© 2024 Mission Publishers", { delay: 0 });
    cy.contains("Unsaved Changes").should("exist");
    cy.intercept("POST", "/api/tStrings").as("saveCopyright");
    // The fallback UI has no Save button — it autosaves per-string on blur.
    cy.contains("div", "Year of Publication").parent().find("textarea").blur();
    cy.wait("@saveCopyright");
    cy.contains("Changes Saved").should("exist");

    // THEN it saved, and remains an ordinary, editable string afterward.
    // (The lesson selection persists in localStorage across the revisit, so
    // the "Cover (A4)" item reopens automatically already-selected.)
    cy.visit("/translate/DEF");
    cy.contains("div", "Year of Publication", { timeout: 20000 })
      .parent()
      .find("textarea")
      .should("have.value", "© 2024 Mission Publishers");
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
    // The lesson picker only renders once all three requests that gate
    // TranslateHome's loading state resolve (loadTranslatingLanguage,
    // loadLessons, loadLanguages) — wait for them before clicking so we
    // don't click into a list that's still reflowing while data lands.
    cy.intercept("GET", "/api/languages/code/DEF").as("translatingLanguage3");
    cy.intercept("GET", "/api/lessons").as("lessons3");
    cy.intercept("GET", "/api/languages").as("languages3");
    cy.visit("/translate/DEF");
    cy.wait(["@translatingLanguage3", "@lessons3", "@languages3"]);
    cy.contains("button", "Cover (A4)").should("be.visible").click();
    cy.contains("div", "Year of Publication", { timeout: 20000 })
      .parent()
      .find("textarea")
      .should("have.value", "© 2024 Mission Publishers")
      .clear()
      .type("© 2025 Mission Publishers", { delay: 0 });
    cy.intercept("POST", "/api/tStrings").as("saveCopyrightEdit");
    // The fallback UI has no Save button — it autosaves per-string on blur.
    cy.contains("div", "Year of Publication").parent().find("textarea").blur();
    cy.wait("@saveCopyrightEdit");
    cy.contains("Changes Saved").should("exist");

    // THEN the new year is saved, with no special workflow beyond an
    // ordinary string edit.
    // (The lesson selection persists in localStorage across the revisit, so
    // the "Cover (A4)" item reopens automatically already-selected.)
    cy.visit("/translate/DEF");
    cy.contains("div", "Year of Publication", { timeout: 20000 })
      .parent()
      .find("textarea")
      .should("have.value", "© 2025 Mission Publishers");
  });
});

describe("US15: Download translated covers from the language page", () => {
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

  // GIVEN a language with translated cover strings WHEN the operator
  // downloads the A4 cover for Luke quarter 1 in bilingual mode THEN the
  // file is named <Language>_Luke-Q1-Cover-A4-bilingual.odt (FR-008/FR-010:
  // dual-mode Bilingual | Single-Language downloads with mode-suffixed
  // filenames).
  //
  // The odt-content assertions (translated text fields present,
  // bilingual/mono paragraph pairing) are covered by the R2 integration
  // test gate already exercised in US13 behavior 4 (makeLessonFile is
  // shared, unmodified, between lessons and covers) — not duplicated here.
  it("downloads a translated A4 cover named <Language>_Luke-Q1-Cover-A4-bilingual.odt via the cover row's Bilingual link", () => {
    uploadCover("English-Luke-Q1-Cover-A4.odt", "A4");

    // GIVEN: the cover's title string is translated into Français.
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

    // WHEN: the operator downloads the A4 cover from the Français language
    // page THEN the cover row is labelled with a human-readable cover name
    // (never a bare lesson number) and the saved file follows the SOP
    // filename convention with the mode suffix. Français is not a
    // mother-tongue language, so Bilingual pairs with the language itself
    // (majorityLanguageId=2) — a "bilingual"-suffixed filename.
    cy.visit("/");
    cy.contains("Français").click();
    cy.contains("a", "97").should("not.exist");
    cy.contains("tr", "Luke 1-Cover (A4)").contains("button", "Bilingual").click();
    cy.readFile("cypress/downloads/Français_Luke-Q1-Cover-A4-bilingual.odt", {
      timeout: 20000,
    }).should("exist");
  });

  // GIVEN a bilingual (mother-tongue) language configuration WHEN a cover
  // is downloaded THEN the output request carries the mother-tongue/
  // majority-language pairing the same way a bilingual lesson download
  // does — majorityLanguageId is the language's defaultSrcLang.
  it("requests a bilingual cover download the same way a bilingual lesson download does", () => {
    uploadCover("English-Luke-Q1-Cover-A3.odt", "A3");

    // Batanga is a mother-tongue language, so the Bilingual link pairs the
    // translation with its source language (defaultSrcLang=1).
    cy.visit("/");
    cy.contains("Batanga").click();
    cy.intercept("GET", /\/api\/languages\/3\/lessons\/\d+\/document.*/).as("downloadCover");
    cy.contains("tr", "Luke 1-Cover (A3)").contains("button", "Bilingual").click();
    cy.wait("@downloadCover").its("request.url").should("include", "majorityLanguageId=1");
  });

  // GIVEN a non-mother-tongue language configuration WHEN a cover is
  // downloaded THEN the two modes behave like lesson downloads: Bilingual
  // carries the language's own id as majorityLanguageId, Single-Language
  // carries 0.
  it("requests dual-mode cover downloads the same way lesson downloads do for a non-mother-tongue language", () => {
    uploadCover("English-Luke-Q1-Cover-A3.odt", "A3");

    cy.visit("/");
    cy.contains("Français").click();

    cy.intercept("GET", /\/api\/languages\/2\/lessons\/\d+\/document.*/).as("downloadCover");
    cy.contains("tr", "Luke 1-Cover (A3)").contains("button", "Bilingual").click();
    cy.wait("@downloadCover").its("request.url").should("include", "majorityLanguageId=2");

    cy.contains("tr", "Luke 1-Cover (A3)").contains("button", "Single-Language").click();
    cy.wait("@downloadCover").its("request.url").should("include", "majorityLanguageId=0");
  });

  // GIVEN a language page listing downloadable documents WHEN covers are
  // listed THEN their download links use human-readable cover names —
  // never the reserved lesson number (97/98).
  it("lists cover download links with human-readable cover names, never a bare lesson number", () => {
    uploadCover("English-Luke-Q1-Cover-A4.odt", "A4");
    uploadCover("English-Luke-Q1-Cover-A3.odt", "A3");

    cy.visit("/");
    cy.contains("Français").click();
    cy.contains("Cover (A4)").should("exist");
    cy.contains("Cover (A3)").should("exist");
    // The quarter assembly row also offers the cover downloads.
    cy.contains("tr", "Assemble Quarter").contains("Cover (A4)").should("exist");
    cy.contains("97").should("not.exist");
    cy.contains("98").should("not.exist");
  });
});
