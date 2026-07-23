describe("Language archive routing — US2: blocked archive with dependents, then re-point and archive succeeds", () => {
  beforeEach(cy.login);

  it("blocks archiving a language with active dependents, then succeeds after re-pointing them", () => {
    // Fixture languages Français and Batanga both default their source
    // language to English, so English has two active dependents.
    cy.visit("/");
    cy.contains("button", "English").click();

    cy.contains("button", "Archive").click();

    cy.get("[role='dialog']").within(() => {
      cy.intercept("POST", "/api/admin/languages/*/archive").as("archiveLanguage");
      cy.contains("button", "Archive").click();
    });

    cy.wait("@archiveLanguage");

    // Blocked: no confirmation dialog remains, the language stays active, and
    // the dependent names are surfaced in an assertive alert region.
    cy.get("[role='dialog']").should("not.exist");
    cy.get("[role='alert']").should("contain.text", "Français").and("contain.text", "Batanga");
    cy.contains("button", "Archive").should("exist");

    cy.visit("/");
    cy.contains("button", "English").should("exist");

    // Re-point Français's source language away from English.
    cy.visit("/");
    cy.contains("button", "Français").click();
    cy.intercept("POST", "/api/admin/languages/2").as("updateFrancais");
    cy.inLabel("Source Language").select("Batanga");
    cy.wait("@updateFrancais");

    // Re-point Batanga's source language away from English.
    cy.visit("/");
    cy.contains("button", "Batanga").click();
    cy.intercept("POST", "/api/admin/languages/3").as("updateBatanga");
    cy.inLabel("Source Language").select("Français");
    cy.wait("@updateBatanga");

    // Retry archiving English — no dependents remain, so it now succeeds.
    cy.visit("/");
    cy.contains("button", "English").click();

    cy.contains("button", "Archive").click();

    cy.get("[role='dialog']").within(() => {
      cy.intercept("POST", "/api/admin/languages/*/archive").as("archiveEnglishAgain");
      cy.contains("button", "Archive").click();
    });

    cy.wait("@archiveEnglishAgain");

    cy.url().should("eq", "http://localhost:8080/");
    cy.contains("button", "English").should("not.exist");
  });
});
