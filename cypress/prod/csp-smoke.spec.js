import { recordCspViolations } from "../support/prod-e2e";

// Production-mode smoke test for the CSP × styled-components interaction.
//
// Why this exists: the production white-screen fixed in #111 only reproduces
// when the Express PRODUCTION server serves the production bundle in a real
// browser. Dev is served by webpack-dev-server (no helmet, so no CSP) and
// styled-components only switches to CSSOM `insertRule()` injection in
// production — so neither `yarn dev-web` nor the Jest suite exercised "this CSP
// + the real app in a browser". The helmet `style-src` (no 'unsafe-inline')
// blocked styled-components' runtime <style> tags, the tag never got a
// CSSStyleSheet, and styled-components threw, white-screening the app.
//
// This harness runs against :8081 (the prod server, WITH its real CSP) and
// asserts both halves of the fix: (a) no CSP violation fires, and (b) the
// styled-components styles actually render.
//
// NOTE: we deliberately do NOT register `Cypress.on("uncaught:exception", ...)`.
// If the regression returns, styled-components throws
// "CSSStyleSheet could not be found on HTMLStyleElement" during render; letting
// that bubble fails the spec, which is exactly what we want.

describe("production CSP smoke", () => {
  it("renders styled-components styles with no CSP violations", () => {
    cy.visit("/", {
      onBeforeLoad: recordCspViolations,
    });

    // Wait for PublicHome to render. The MainRouter only renders its routes once
    // `currentUser.loaded` is true (after /api/auth/get-session resolves), so the
    // "Lessons from Luke" <h1> appearing is the "app is fully up" signal. If the
    // styled-components regression returns, the app white-screens and this times
    // out — a red on its own.
    cy.contains("h1", "Lessons from Luke").should("be.visible");

    // (b) Styles are actually applied — falsifiable proof styled-components ran.
    // The styled `RootDiv` sets `font-family: Helvetica, sans-serif`; the heading
    // inherits it. With the CSP blocking styled-components, this rule never lands
    // and the font falls back to the UA default (no "Helvetica").
    cy.contains("h1", "Lessons from Luke")
      .should("have.css", "font-family")
      .and("match", /Helvetica/i);

    // The primary login button is brand blue (Colors.primary #3f88c5 →
    // rgb(63, 136, 197)). A blocked stylesheet leaves the UA default button
    // background instead.
    cy.contains("button", /log[_ ]?in/i).should(
      "have.css",
      "background-color",
      "rgb(63, 136, 197)"
    );

    // (a) No CSP violation fired during the app's load + render. styled-components
    // injects its <style> tags as a side effect of the renders we just asserted,
    // so any style-src violation has already been recorded by now.
    cy.window().its("__csp").should("have.length", 0);

    // --- Enforcement tripwire ------------------------------------------------
    // Every assertion above is only meaningful if the browser is ACTUALLY
    // enforcing the CSP. Cypress strips CSP headers by default; we re-enable
    // enforcement with `experimentalCspAllowList: true` (cypress.prod.config.js).
    // But that's an experimental flag — if a future Cypress release renames or
    // drops it, enforcement would silently vanish and this whole spec would pass
    // even against the bug (a tautology). So actively prove the policy still
    // bites by injecting an un-nonced <style> (exactly what styled-components
    // does, minus the nonce) and confirming the browser refused it.
    // Yields `true` only when the browser BLOCKED the un-nonced <style> (i.e. the
    // policy is enforced). A blocked <style> never gets a stylesheet, so its
    // `.sheet` is null; if the CSP weren't enforced (e.g. Cypress quietly reverted
    // to stripping it) the style would apply, `.sheet` would be a live
    // CSSStyleSheet, this yields `false`, and the assertion fails loudly instead
    // of passing as a tautology.
    cy.window()
      .then((win) => {
        const probe = win.document.createElement("style");
        probe.textContent = ".csp-enforcement-probe{color:rgb(1,2,3)}";
        // Deliberately NO nonce → must be blocked by `style-src 'self' 'nonce-…'`.
        win.document.head.appendChild(probe);
        return probe.sheet === null;
      })
      .should("equal", true);

    // The blocked probe also fires a style-src violation. Asserting it landed in
    // __csp proves the securitypolicyviolation listener is genuinely wired up and
    // observing the app window — so the "zero violations" check above is itself a
    // real signal and not a silently-dead listener.
    cy.window()
      .its("__csp")
      .should("satisfy", (violations) => violations.some((v) => /style-src/.test(v)));
  });
});
