describe("Translate", () => {
  it("Handles bad codes", () => {
    cy.visit("/translate/NOPEDYNOPE");
    cy.contains(
      "Translation Project not found. Please check that you have the right web address."
    ).should("exist");
  });

  it("Changes sources", () => {
    cy.visitTranslatePage("GHI");

    cy.inLabel("Source Language").select("Français", { force: true });
    cy.contains("Le livre de Luc").should("exist");
  });

  it("Uses the defaultSrcLang to set interface locale", () => {
    cy.login();
    cy.request("POST", "/api/admin/languages/3", { defaultSrcLang: 2 });
    cy.request("POST", "/api/users/logout");

    cy.visit("/translate/GHI");
    cy.contains("Luc 1-1").should("exist");

    cy.login();
    cy.request("POST", "/api/admin/languages/3", { defaultSrcLang: 1 });
  });

  it("Translates stuff", () => {
    cy.visitTranslatePage("GHI");
    const ctrlsDiv = () =>
      cy.contains("label", "Source Language").closest("div");
    cy.contains("button", ">>>").click();
    cy.contains("button", ">>").click();

    ctrlsDiv().contains(
      "Talk to God every day this week, and be ready to share all the different places and ways you talked to God."
    );
    cy.get("textarea").type(
      "Langwanaha Njambbɛ buwa kaha buwa bó sɔndɛ tɛh eni...",
      {
        delay: 0
      }
    );
    cy.contains("Unsaved Changes").should("exist");

    cy.intercept("POST", "/api/tStrings").as("saveTStrings");
    cy.contains("button", "Save").click();
    cy.wait("@saveTStrings");
    cy.contains("Changes Saved").should("exist");

    cy.visitTranslatePage("GHI");
    cy.contains("Langwanaha Njambbɛ buwa kaha buwa bó sɔndɛ tɛh eni.").should(
      "exist"
    );
  });
});
