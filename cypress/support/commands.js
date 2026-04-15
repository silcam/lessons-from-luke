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

// Visit the translate page for a language code and wait for all data to load.
// Sets up network intercepts BEFORE visiting so the 3 API calls the page fires
// on mount are reliably caught, then waits for them to complete. This is more
// robust than polling the DOM, which can time out on slow CI runners.
Cypress.Commands.add("visitTranslatePage", code => {
  cy.intercept("GET", "/api/lessons").as("_tpLessons");
  cy.intercept("GET", `/api/languages/code/${code}`).as("_tpLanguage");
  cy.intercept("GET", "/api/languages").as("_tpLanguages");
  cy.visit(`/translate/${code}`);
  cy.wait(["@_tpLessons", "@_tpLanguage", "@_tpLanguages"]);
});
