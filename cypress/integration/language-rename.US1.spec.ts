describe("Language rename — US1: admin renames a language project", () => {
  beforeEach(cy.login);

  it("renames a language and shows the new name in the heading and admin list without a reload", () => {
    cy.visit("/");
    cy.contains("button", "Batanga").click();

    cy.contains("h1", "Batanga").should("exist");

    cy.contains("button", "Edit").click();

    cy.get('input[type="text"]').clear().type("Batanga Renamed");
    cy.intercept("POST", "/api/admin/languages/*").as("renameLanguage");
    cy.contains("button", "Save").click();
    cy.wait("@renameLanguage");

    // Heading updates in place — no reload.
    cy.contains("h1", "Batanga Renamed").should("exist");
    cy.contains("button", "Batanga").should("not.exist");

    // Back out to the admin language list and confirm the new name shows there too.
    cy.contains("button", `< Languages`).click();
    cy.contains("Batanga Renamed").should("exist");
  });

  it("rejects renaming to a name already used by another language and retains the original name", () => {
    cy.visit("/");
    cy.contains("button", "Batanga").click();

    cy.contains("button", "Edit").click();

    cy.get('input[type="text"]').clear().type("Français");
    cy.contains("button", "Save").click();

    cy.contains("A language with that name already exists.").should("exist");

    // Original name is retained — no rename was applied.
    cy.contains("h1", "Batanga").should("exist");
    cy.contains("h1", "Français").should("not.exist");
  });
});
