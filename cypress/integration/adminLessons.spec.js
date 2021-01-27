describe("Admin Lessons", () => {
  before(cy.loadFixtures);

  beforeEach(cy.login);

  it("Adds a Lesson", () => {
    cy.visit("/");
    cy.contains("button", "Add Lesson").click();
    cy.fixture("English_Luke-Q1-L06.odt", "base64").then(fileContent => {
      cy.get("input[type='file']").parent().upload(
        {
          fileContent,
          fileName: "English_Luke-Q1-L06.odt",
          mimeType: "application/vnd.oasis.opendocument.text",
          encoding: "base64"
        },
        { subjectType: "drag-n-drop" }
      );
    });
    cy.contains("button", "English_Luke-Q1-L06.odt").should("exist");
    cy.inLabel("Book").should("have.value", "Luke");
    cy.inLabel("Series").should("have.value", "1");
    cy.inLabel("Lesson").should("have.value", "6");
    cy.contains("button", "Save").click();
    cy.url().should("eq", "http://localhost:8080/update-issues/16");
    cy.contains("h2", "No issues").should("exist");
    cy.contains("button", "View Lesson").click();
    cy.url().should("eq", "http://localhost:8080/lessons/16");
    cy.contains("h1", "Luke 1-6").should("exist");
    cy.contains("NOTE: It is important to review").should("exist");
  });

  it("Edits lessons", () => {
    cy.visit("/");
    cy.contains("a", "Luke 1-2").click();
    cy.contains("button", "Edit").click();

    // Merge
    cy.contains("div", "KNOW:")
      .contains("button", "Merge Next with Space")
      .invoke("show")
      .click();
    cy.contains(
      "KNOW: The children will know that nothing is impossible with God."
    ).should("exist");

    // Delete
    cy.contains("div", "Lesson Overview")
      .contains("button", "Delete")
      .invoke("show")
      .click();
    cy.contains("Lesson Overview").should("not.exist");

    // Edit
    cy.contains("div", "Today’s Truth")
      .contains("button", "Edit")
      .invoke("show")
      .click();
    cy.get("textarea").type(" for today");
    cy.contains("button", "Ok").click();
    cy.contains("Today’s Truth for today").should("exist");

    cy.contains("button", "Save").click();
    cy.contains("button", "Edit");
    cy.contains(
      "KNOW: The children will know that nothing is impossible with God."
    ).should("exist");
    cy.contains("Lesson Overview").should("not.exist");
    cy.contains("Today’s Truth for today").should("exist");

    cy.visit("/translate/GHI");
    cy.contains("Luke 1-2").click();
    cy.contains(
      "KNOW: The children will know that nothing is impossible with God."
    ).should("exist");
    cy.contains("Lesson Overview").should("not.exist");
    cy.contains("Today’s Truth for today").should("exist");
  });
});
