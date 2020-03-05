describe("Translate", () => {
  before(cy.loadFixtures);

  it("Handles bad codes", () => {
    cy.visit("/translate/NOPEDYNOPE");
    cy.contains(
      "Translation Project not found. Please check that you have the right web address."
    ).should("exist");
  });

  it("Changes sources", () => {
    cy.visit("/translate/GHI");
    cy.inLabel("Source Language").select("Français");
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
    cy.visit("/translate/GHI");
    cy.contains("div", "Talk to God every day")
      .parent()
      .find("textarea")
      .type("Langwanaha Njambbɛ buwa kaha buwa bó sɔndɛ tɛh eni...", {
        delay: 0
      });
    cy.contains("Unsaved Changes").should("exist");
    cy.contains("Detailed Lesson Plan").click();
    cy.contains("Changes Saved").should("exist");

    cy.visit("/translate/GHI");
    cy.contains("Langwanaha Njambbɛ buwa kaha buwa bó sɔndɛ tɛh eni.").should(
      "exist"
    );
  });
});
