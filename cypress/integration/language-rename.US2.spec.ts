describe("Language rename — US2: invalid rename attempts are rejected clearly", () => {
  beforeEach(cy.login);

  it("rejects an empty or whitespace-only name with inline feedback and keeps the original name", () => {
    cy.visit("/");
    cy.contains("button", "Batanga").click();

    cy.contains("button", "Edit").click();

    cy.get("input").clear().type("   ");
    cy.intercept("POST", "/api/admin/languages/*").as("renameLanguage");
    cy.contains("button", "Save").click();

    // No request is sent for a blank/whitespace-only name, and inline
    // feedback is shown instead.
    cy.get("@renameLanguage.all").should("have.length", 0);
    cy.get("[role='alert']").should("exist");

    // Original name is retained — no rename was applied.
    cy.contains("h3", "Batanga").should("exist");
  });

  it("rejects renaming to a name already used by another language, consistent with the create-language form", () => {
    cy.visit("/");
    cy.contains("button", "Batanga").click();

    cy.contains("button", "Edit").click();

    cy.get("input").clear().type("Français");
    cy.contains("button", "Save").click();

    cy.contains("A language with that name already exists.").should("exist");

    // Original name is retained — no rename was applied.
    cy.contains("h3", "Batanga").should("exist");
    cy.contains("h3", "Français").should("not.exist");
  });

  it("trims leading and trailing whitespace before persisting the new name", () => {
    cy.visit("/");
    cy.contains("button", "Batanga").click();

    cy.contains("button", "Edit").click();

    cy.get("input").clear().type("  Batanga Trimmed  ");
    cy.intercept("POST", "/api/admin/languages/*").as("renameLanguage");
    cy.contains("button", "Save").click();
    cy.wait("@renameLanguage");

    cy.contains("h3", "Batanga Trimmed").should("exist");
    cy.contains("h3", "  Batanga Trimmed  ").should("not.exist");
  });

  it("allows re-saving the language's own current name unchanged without a duplicate-name error", () => {
    cy.visit("/");
    cy.contains("button", "Batanga").click();

    cy.contains("button", "Edit").click();

    // Save without changing the draft — it should equal the current name.
    cy.intercept("POST", "/api/admin/languages/*").as("renameLanguage");
    cy.contains("button", "Save").click();
    cy.wait("@renameLanguage");

    cy.contains("A language with that name already exists.").should("not.exist");
    cy.contains("h3", "Batanga").should("exist");
  });
});
