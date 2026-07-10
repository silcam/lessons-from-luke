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
    cy.contains("span.lessonString", "title", { matchCase: false }).should("exist");
    cy.contains("span.lessonString", "subtitle", { matchCase: false }).should("exist");
    cy.contains("span.lessonString", "copyright", { matchCase: false }).should("exist");
    cy.contains("span.lessonString", "address", { matchCase: false }).should("exist");
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
