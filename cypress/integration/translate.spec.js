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

  it("Translates stuff", () => {
    cy.visit("/translate/GHI");
    cy.contains("div", "Talk to God every day")
      .parent()
      .find("textarea")
      .type(
        "Langwanaha Njambbɛ buwa kaha buwa bó sɔndɛ tɛh eni. Kenjɛhɛ iyembwa oveve na neve ndi kaha ova olangwaninɔ Njambɛ nlingo mú sɔndɛ tɛh eni.",
        { delay: 0 }
      );
    cy.contains("Detailed Lesson Plan").click();

    cy.visit("/translate/GHI");
    cy.contains("Langwanaha Njambbɛ buwa kaha buwa bó sɔndɛ tɛh eni.").should(
      "exist"
    );
  });
});
