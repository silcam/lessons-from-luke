describe("Translate Fallback", () => {
  before(cy.loadFixtures);

  it("Changes sources", () => {
    cy.visit("/translate/GHI");
    cy.contains("Luke 1-2").click();

    cy.inLabel("Source Language").select("Français");
    cy.contains("Un ange visite Marie").should("exist");
  });

  it("Translates stuff", () => {
    cy.visit("/translate/GHI");
    cy.contains("Luke 1-2").click();

    cy.contains("div", "Nothing is impossible with God")
      .parent()
      .find("textarea")
      .type("Naha dambo dihihitiwɛ boholo ó pɛlɛ ya Njambɛ.", {
        delay: 0
      });
    cy.contains("Unsaved Changes").should("exist");
    cy.contains("Objective").click();
    cy.contains("Changes Saved").should("exist");

    cy.visit("/translate/GHI");
    cy.contains("Luke 1-2").click();
    cy.contains("Naha dambo dihihitiwɛ boholo ó pɛlɛ ya Njambɛ.").should(
      "exist"
    );
  });
});
