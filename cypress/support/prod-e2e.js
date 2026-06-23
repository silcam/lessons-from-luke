// ***********************************************************
// Support file for the production-mode smoke harness
// (cypress.prod.config.js). Loaded automatically before the
// cypress/prod/**/*.spec.js specs.
//
// Deliberately minimal: it does NOT register the dev suite's
// `beforeEach(cy.resetDatabase())` (cypress/support/e2e.js),
// because /api/test/reset-storage is mounted only in the test
// environment and 404s under NODE_ENV=production. The prod smoke
// is unauthenticated and read-only, so it needs no DB reset.
// ***********************************************************

// Attach a `securitypolicyviolation` listener to the application window before
// its document loads, accumulating any CSP violations onto `win.__csp`. Specs
// pass this to `cy.visit("/", { onBeforeLoad })` and later assert the array is
// empty, proving the production CSP didn't block styled-components' runtime
// <style> tags (or anything else).
export function recordCspViolations(win) {
  win.__csp = [];
  win.addEventListener("securitypolicyviolation", (e) => {
    win.__csp.push(`${e.violatedDirective} ${e.blockedURI}`);
  });
}
