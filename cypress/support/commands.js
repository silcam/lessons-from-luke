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
// 1. Clears localStorage so no prior lesson selection (which disables that button)
//    leaks from a previous test.
// 2. Registers intercepts BEFORE visiting so the 3 initial API calls are caught.
// 3. After the 3 calls complete, waits for span.lessonString to appear — those
//    elements only render once the lesson tStrings have also loaded, so this
//    serves as the final "page fully ready" signal.
Cypress.Commands.add("visitTranslatePage", code => {
  cy.clearLocalStorage();
  cy.intercept("GET", "/api/lessons").as("_tpLessons");
  cy.intercept("GET", `/api/languages/code/${code}`).as("_tpLanguage");
  cy.intercept("GET", "/api/languages").as("_tpLanguages");
  cy.visit(`/translate/${code}`);
  cy.wait(["@_tpLessons", "@_tpLanguage", "@_tpLanguages"]);
  cy.get("span.lessonString", { timeout: 20000 }).should("exist");
});
