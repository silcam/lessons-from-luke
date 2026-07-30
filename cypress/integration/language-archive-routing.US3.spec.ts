describe("Language archive routing — US3: select/refresh/back-forward/direct-link a language detail URL", () => {
  beforeEach(cy.login);

  it("navigates to a shareable detail URL when a language is selected from the list", () => {
    cy.visit("/");
    cy.contains("button", "Batanga").click();

    cy.url().should("match", /\/languages\/\d+$/);
    cy.contains("Batanga").should("exist");
  });

  it("re-renders the detail view (not the bare list) after a full page reload", () => {
    cy.visit("/");
    cy.contains("button", "Batanga").click();

    cy.url().should("match", /\/languages\/\d+$/);

    cy.reload();

    cy.url().should("match", /\/languages\/\d+$/);
    cy.contains("Batanga").should("exist");
  });

  it("supports browser back/forward between the list and the detail view", () => {
    cy.visit("/");
    cy.contains("button", "Batanga").click();

    cy.url().should("match", /\/languages\/\d+$/);

    cy.go("back");

    cy.url().should("eq", "http://localhost:8080/");

    cy.go("forward");

    cy.url().should("match", /\/languages\/\d+$/);
    cy.contains("Batanga").should("exist");
  });

  it("renders the detail view directly on a fresh visit, without first showing the bare list", () => {
    cy.visit("/");
    cy.contains("button", "Batanga").click();
    cy.url()
      .should("match", /\/languages\/\d+$/)
      .then((url) => {
        const languageUrl = url as unknown as string;

        cy.visit(languageUrl);
        cy.contains("Batanga").should("exist");
      });
  });

  it("redirects to the Languages list when directly visiting a nonexistent language detail URL", () => {
    cy.visit("/languages/999999");

    cy.url().should("eq", "http://localhost:8080/");
    cy.contains("button", "Batanga").should("exist");
  });
});
