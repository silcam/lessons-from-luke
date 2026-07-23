describe("Language archive routing — US1: archive a language with no dependents", () => {
  beforeEach(cy.login);

  it("archives a language with no dependents and removes it from the active Languages list", () => {
    cy.visit("/");
    cy.contains("button", "Batanga").click();

    cy.contains("button", "Archive").click();

    cy.get("[role='dialog']").within(() => {
      cy.contains("button", "Cancel").should("exist");
      cy.intercept("POST", "/api/admin/languages/*/archive").as("archiveLanguage");
      cy.contains("button", "Archive").click();
    });

    cy.wait("@archiveLanguage");

    cy.url().should("eq", "http://localhost:8080/");
    cy.contains("button", "Batanga").should("not.exist");
  });

  it("leaves the language active when the archive confirmation is cancelled", () => {
    cy.visit("/");
    cy.contains("button", "Batanga").click();

    cy.contains("button", "Archive").click();

    cy.get("[role='dialog']").within(() => {
      cy.contains("button", "Cancel").click();
    });

    cy.get("[role='dialog']").should("not.exist");
    cy.contains("button", "Archive").should("exist");

    cy.visit("/");
    cy.contains("button", "Batanga").should("exist");
  });
});
