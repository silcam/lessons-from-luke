import { recordCspViolations } from "../support/prod-e2e";

// Production-mode smoke test for the two CSP mechanisms DocPreview relies on.
//
// Why this exists: DocPreview injects LibreOffice-generated HTML via
// `dangerouslySetInnerHTML` under the Express production server's real CSP.
// Dev (webpack-dev-server, no helmet) has no CSP, and jsdom (Jest) does not
// enforce CSP — so neither exercises "an innerHTML-injected <style nonce> and a
// data-attribute click, under this exact style-src/script-src policy in a real
// browser". This harness does, against :8081 (prod server, WITH its real CSP).
//
// It does NOT need the real /translate route or any DB data: both fixes are
// CSP-mechanism questions independent of the lesson content, so we reproduce
// exactly what DocPreview does to the DOM on the already-CSP-served PublicHome
// page. The two `it`s below map 1:1 to the plan's Part A and Part B.
//
// Reading the nonce the way the app does: DocPreview reads the document's
// per-request nonce from `<meta name="csp-nonce">` (seeded at page load), which
// matches the nonce in the CSP header. `experimentalCspAllowList: true`
// (cypress.prod.config.js) leaves style-src/script-src fully enforced with that
// original nonce, so this is a faithful reproduction.

describe("production CSP smoke — DocPreview mechanisms", () => {
  beforeEach(() => {
    cy.visit("/", { onBeforeLoad: recordCspViolations });
    // PublicHome fully up (the app is CSP-served and rendered) before we probe.
    cy.contains("h1", "Lessons from Luke").should("be.visible");
  });

  // --- Part A -------------------------------------------------------------
  // A <style> element that arrives inside a dangerouslySetInnerHTML blob, with
  // the document nonce stamped onto it, is honored by `style-src 'self'
  // 'nonce-…'`. The flagged risk: does a nonce survive innerHTML fragment
  // parsing and get applied? Prove it does — and, as an enforcement tripwire,
  // that the SAME injection WITHOUT the nonce is blocked.
  it("honors an innerHTML-injected <style nonce> and blocks the un-nonced one", () => {
    // Do all DOM work in one callback and return only primitive results, so we
    // never mix cy commands with a synchronous return in the same `.then`.
    cy.window()
      .then((win) => {
        const nonce = win.document.querySelector('meta[name="csp-nonce"]')?.getAttribute("content");

        // Nonced <style>, injected via innerHTML exactly like DocPreview does.
        const nonced = win.document.createElement("div");
        nonced.innerHTML = `<style nonce="${nonce}">.dp-nonced-probe{orphans:2}</style>`;
        win.document.body.appendChild(nonced);

        // Same injection, no nonce — must be refused by the policy.
        const unNonced = win.document.createElement("div");
        unNonced.innerHTML = `<style>.dp-unnonced-probe{orphans:2}</style>`;
        win.document.body.appendChild(unNonced);

        const noncedSheet = nonced.querySelector("style").sheet;
        return {
          // In prod the meta must exist; without it DocPreview's stamp is a
          // no-op and the whole fix is moot.
          hasNonce: typeof nonce === "string" && nonce.length > 0,
          // The nonced style APPLIED: the fragment-parsed nonce was honored.
          noncedApplied: noncedSheet !== null,
          noncedRuleCount: noncedSheet ? noncedSheet.cssRules.length : 0,
          // Tripwire: the un-nonced style was BLOCKED (no stylesheet). If CSP
          // were silently not enforced, this would be a live sheet.
          unNoncedBlocked: unNonced.querySelector("style").sheet === null,
        };
      })
      .then((r) => {
        cy.wrap(r.hasNonce, { log: false }).should("equal", true);
        cy.wrap(r.noncedApplied, { log: false }).should("equal", true);
        cy.wrap(r.noncedRuleCount, { log: false }).should("be.greaterThan", 0);
        cy.wrap(r.unNoncedBlocked, { log: false }).should("equal", true);
      });

    // The blocked un-nonced style fires a style-src violation; the nonced one
    // must NOT. Asserting exactly-one style-src violation proves both the
    // listener is live and the nonce genuinely made the difference.
    cy.window()
      .its("__csp")
      .should("satisfy", (v) => v.filter((s) => /style-src/.test(s)).length === 1);
  });

  // --- Part B -------------------------------------------------------------
  // The clickable strings no longer use an inline `onclick=` attribute (blocked
  // by `script-src 'self'`); they carry a data attribute and rely on a
  // JS-registered (delegated) listener, which script-src does not block. Prove
  // the old inline handler is dead under this CSP and the new delegation works.
  it("blocks an inline onclick but runs a delegated listener under script-src", () => {
    cy.window()
      .then((win) => {
        win.__inlineRan = false;
        win.__delegatedIndex = null;

        // OLD approach: inline onclick attribute, injected via innerHTML. Under
        // `script-src 'self'` (no unsafe-inline/unsafe-hashes) this handler is
        // refused — clicking must NOT set the flag.
        const oldSpan = win.document.createElement("div");
        oldSpan.innerHTML = `<span id="dp-inline" onclick="window.__inlineRan = true">x</span>`;
        win.document.body.appendChild(oldSpan);

        // NEW approach: data-ls-index + a delegated listener on the container
        // (mirrors React's synthetic onClick — a JS-added listener, never
        // blocked by script-src).
        const container = win.document.createElement("div");
        container.innerHTML = `<span class="lessonString" data-ls-index="3">y</span>`;
        container.addEventListener("click", (e) => {
          const el = e.target.closest(".lessonString");
          if (el && el.dataset.lsIndex !== undefined) {
            win.__delegatedIndex = Number(el.dataset.lsIndex);
          }
        });
        win.document.body.appendChild(container);

        win.document.getElementById("dp-inline").click();
        container.querySelector(".lessonString").click();
      })
      .then(() => {
        cy.window().its("__inlineRan").should("equal", false);
        cy.window().its("__delegatedIndex").should("equal", 3);
      });

    // The blocked inline handler fires a script-src(-attr) violation, proving it
    // was genuinely refused (not merely a no-op). The delegated listener fires
    // no violation.
    cy.window()
      .its("__csp")
      .should("satisfy", (v) => v.some((s) => /script-src/.test(s)));
  });
});
