describe("Language rename — US2: invalid rename attempts are rejected clearly", () => {
  beforeEach(cy.login);

  it("rejects an empty or whitespace-only name with inline feedback and keeps the original name", () => {
    cy.visit("/");
    cy.contains("button", "Batanga").click();

    cy.contains("button", "Edit name").click();

    cy.get('input[type="text"]').clear().type("   ");
    cy.intercept("POST", "/api/admin/languages/*").as("renameLanguage");
    cy.contains("button", "Save").click();
    cy.wait("@renameLanguage");

    // A whitespace-only name reaches the server, is rejected with 422, and
    // inline feedback is shown.
    cy.contains("[role='alert']", "Language name is required.").should("exist");

    // Original name is retained — no rename was applied.
    cy.contains("h1", "Batanga").should("exist");
  });

  it("rejects renaming to a name already used by another language, consistent with the create-language form", () => {
    cy.visit("/");
    cy.contains("button", "Batanga").click();

    cy.contains("button", "Edit name").click();

    cy.get('input[type="text"]').clear().type("Français");
    cy.contains("button", "Save").click();

    cy.contains("A language with that name already exists.").should("exist");

    // Original name is retained — no rename was applied.
    cy.contains("h1", "Batanga").should("exist");
    cy.contains("h1", "Français").should("not.exist");
  });

  it("trims leading and trailing whitespace before persisting the new name", () => {
    cy.visit("/");
    cy.contains("button", "Batanga").click();

    cy.contains("button", "Edit name").click();

    cy.get('input[type="text"]').clear().type("  Batanga Trimmed  ");
    cy.intercept("POST", "/api/admin/languages/*").as("renameLanguage");
    cy.contains("button", "Save").click();
    cy.wait("@renameLanguage");

    cy.contains("h1", "Batanga Trimmed").should("exist");
    cy.contains("h1", "  Batanga Trimmed  ").should("not.exist");
  });

  it("allows re-saving the language's own current name unchanged without a duplicate-name error", () => {
    cy.visit("/");
    cy.contains("button", "Batanga").click();

    cy.contains("button", "Edit name").click();

    // Save without changing the draft — it should equal the current name.
    cy.intercept("POST", "/api/admin/languages/*").as("renameLanguage");
    cy.contains("button", "Save").click();
    cy.wait("@renameLanguage");

    cy.contains("A language with that name already exists.").should("not.exist");
    cy.contains("h1", "Batanga").should("exist");
  });
});
