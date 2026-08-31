describe("Translate", () => {
  it("Handles bad codes", () => {
    // /translate/:code is gated (003-web-auth-gate); the "not found" fallback
    // renders inside the gate, so sign in before visiting an unknown code.
    cy.login();
    cy.visit("/translate/NOPEDYNOPE");
    cy.contains(
      "Translation Project not found. Please check that you have the right web address."
    ).should("exist");
  });

  it("Changes sources", () => {
    cy.visitTranslatePage("GHI");

    cy.intercept("GET", /\/api\/languages\/\d+\/lessons\/\d+\/tStrings/).as("srcTStrings");
    cy.inLabel("Source Language").select("Français", { force: true });
    cy.wait("@srcTStrings");
    cy.contains("Le livre de Luc").should("exist");
  });

  // Removed: "Uses the defaultSrcLang to set interface locale".
  // It verified that an *anonymous* visitor to /translate/:code inherited the
  // project's defaultSrcLang as the interface locale (reducer setLocaleIfNoUser,
  // which is a no-op once a user is signed in). 003-web-auth-gate gates
  // /translate/:code, so anonymous viewing of a translation page no longer exists
  // and the scenario is unreachable end-to-end. The underlying behavior stays
  // unit-covered: currentUserSlice.test.ts ("setLocaleIfNoUser") and
  // languageSlice.test.ts ("dispatches setTranslating and setLocaleIfNoUser on
  // success").

  it("Translates stuff", () => {
    cy.visitTranslatePage("GHI");
    const ctrlsDiv = () => cy.contains("label", "Source Language").closest("div");
    cy.contains("button", ">>>").click();
    cy.contains("button", ">>").click();

    ctrlsDiv().contains(
      "Talk to God every day this week, and be ready to share all the different places and ways you talked to God."
    );
    cy.get("textarea").type("Langwanaha Njambbɛ buwa kaha buwa bó sɔndɛ tɛh eni...", {
      delay: 0,
    });
    cy.contains("Unsaved Changes").should("exist");

    cy.intercept("POST", "/api/tStrings").as("saveTStrings");
    cy.contains("button", "Save").click();
    cy.wait("@saveTStrings");
    cy.contains("Changes Saved").should("exist");

    cy.visitTranslatePage("GHI");
    cy.contains("Langwanaha Njambbɛ buwa kaha buwa bó sɔndɛ tɛh eni.").should("exist");
  });
});
