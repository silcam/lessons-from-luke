describe("Translate Fallback", () => {
  it("Changes sources", () => {
    cy.visitTranslatePage("GHI");
    cy.intercept("GET", /\/api\/languages\/\d+\/lessons\/\d+\/tStrings/).as("lesson2TStrings");
    cy.contains("Luke 1-2").click();
    cy.wait("@lesson2TStrings");

    cy.intercept("GET", /\/api\/languages\/\d+\/lessons\/\d+\/tStrings/).as("srcTStrings");
    cy.inLabel("Source Language").select("Français", { force: true });
    cy.wait("@srcTStrings");
    cy.contains("Un ange visite Marie").should("exist");
  });

  it("Translates stuff", () => {
    cy.visitTranslatePage("GHI");
    cy.intercept("GET", /\/api\/languages\/\d+\/lessons\/\d+\/tStrings/).as("lesson2TStrings");
    cy.contains("Luke 1-2").click();
    cy.wait("@lesson2TStrings");

    cy.contains("div", "Nothing is impossible with God")
      .parent()
      .find("textarea")
      .type("Naha dambo dihihitiwɛ boholo ó pɛlɛ ya Njambɛ.", {
        delay: 0
      });
    cy.contains("Unsaved Changes").should("exist");

    cy.intercept("POST", "/api/tStrings").as("saveTStrings");
    cy.contains("Objective").click();
    cy.wait("@saveTStrings");
    cy.contains("Changes Saved").should("exist");

    cy.visitTranslatePage("GHI");
    cy.intercept("GET", /\/api\/languages\/\d+\/lessons\/\d+\/tStrings/).as("lesson2TStringsReload");
    cy.contains("Luke 1-2").click();
    cy.wait("@lesson2TStringsReload");
    cy.contains("Naha dambo dihihitiwɛ boholo ó pɛlɛ ya Njambɛ.").should(
      "exist"
    );
  });
});
