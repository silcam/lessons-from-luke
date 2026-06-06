describe("Login Page", () => {
  it("Rejects bad logins", () => {
    cy.visit("/");
    cy.placeholder("Email").type(Cypress.env("adminEmail"));
    cy.placeholder("Password").type("??");
    cy.contains("button", "Log In").click();
    cy.contains("Login failed").should("exist");
  });

  it("Logs in correctly", () => {
    cy.visit("/");
    cy.placeholder("Email").type(Cypress.env("adminEmail"));
    cy.placeholder("Password").type(Cypress.env("adminPassword"));
    cy.contains("button", "Log In").click();
    cy.contains("button", "Log Out").click();
    cy.contains("button", "Log In").should("exist");
  });
});
