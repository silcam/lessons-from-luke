describe("Login Page", () => {
  it("Rejects bad logins", () => {
    cy.visit("/");
    cy.placeholder("Username").type("chris");
    cy.placeholder("Password").type("??");
    cy.contains("button", "Log In").click();
    cy.contains("Login failed").should("exist");
  });

  it("Logs in correctly", () => {
    cy.visit("/");
    cy.placeholder("Username").type("chris");
    cy.placeholder("Password").type("yo");
    cy.contains("button", "Log In").click();
    cy.contains("button", "Log Out").click();
    cy.contains("button", "Log In").should("exist");
  });
});
