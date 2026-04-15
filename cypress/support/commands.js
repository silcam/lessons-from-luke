// ***********************************************
// This example commands.js shows you how to
// create various custom commands and overwrite
// existing commands.
//
// For more comprehensive examples of custom
// commands please read more here:
// https://on.cypress.io/custom-commands
// ***********************************************
//
//
// -- This is a parent command --
// Cypress.Commands.add("login", (email, password) => { ... })
//
//
// -- This is a child command --
// Cypress.Commands.add("drag", { prevSubject: 'element'}, (subject, options) => { ... })
//
//
// -- This is a dual command --
// Cypress.Commands.add("dismiss", { prevSubject: 'optional'}, (subject, options) => { ... })
//
//
// -- This will overwrite an existing command --
// Cypress.Commands.overwrite("visit", (originalFn, url, options) => { ... })

Cypress.Commands.add("resetDatabase", () =>
  cy.request({ method: "POST", url: "/api/test/reset-storage", timeout: 30000 })
);

Cypress.Commands.add("loadFixtures", () => cy.resetDatabase());

Cypress.Commands.add("login", () =>
  cy.request("POST", "/api/users/login", { username: "chris", password: "yo" })
);

// Find input by placeholder
Cypress.Commands.add("placeholder", placeholder =>
  cy.get(`input[placeholder='${placeholder}']`)
);

// // Find item by label
// Cypress.Commands.add("withLabel", label =>
//   cy
//     .contains("label", label)
//     .siblings()
//     .first()
// );

// Find item by label
Cypress.Commands.add("inLabel", label =>
  cy
    .contains("label", label)
    .find("input, select")
    .first()
);

// Wait for the translate page to finish loading lesson data.
// Waits for any span.lessonString element to appear (the first lesson is
// auto-selected by the app). Used instead of hard-coded content assertions
// as a page-ready signal.
Cypress.Commands.add("waitForTranslatePage", () => {
  cy.get("span.lessonString", { timeout: 10000 }).should("exist");
});
