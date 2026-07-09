// US3 (specs/007-assembled-quarter-download): "Assembling…" while queued/running,
// then the file downloads on ready. A rapid double-click attaches to the same
// job rather than starting a second one.
//
// The DB fixtures used by cy.login/cy.resetDatabase only carry a partial
// series 1 (5 lessons — see test/fixtures-0.json), and a real assembly run
// needs `soffice` (see specs/007-assembled-quarter-download/quickstart.md).
// Neither is available to a hermetic Cypress run, so this spec stubs the
// language/lesson load and the assembly lifecycle endpoints directly — the
// behavior under test here is the frontend's queued/running/ready lifecycle
// and click-dedup, which is exactly what `useAssembleQuarter` /
// `AssembleQuarterButton` own. Real end-to-end (soffice + a real complete
// quarter) is exercised manually per quickstart.md and closed out in the
// downstream acceptance-verification task (6.4.7).

describe("Assemble Quarter (US3)", () => {
  beforeEach(cy.login);

  const testLanguage = {
    languageId: 999,
    name: "AssembleTestLang",
    code: "ATL",
    motherTongue: false,
    progress: [],
    defaultSrcLang: 1,
  };

  // A complete quarter: series 2 lessons 14-26 plus the -99 TOC lesson,
  // mirroring the real series-2 fixture set named in quickstart.md.
  const seriesTwoLessons = [99, ...Array.from({ length: 13 }, (_, i) => 14 + i)].map(
    (lessonNum, index) => ({
      lessonId: 2000 + index,
      book: "Luke",
      series: 2,
      lesson: lessonNum,
      version: 1,
    })
  );

  function visitLanguagePage() {
    cy.intercept("GET", "/api/admin/languages", [testLanguage]).as("adminLanguages");
    cy.intercept("GET", "/api/lessons", seriesTwoLessons).as("lessons");
    cy.visit("/");
    cy.wait(["@adminLanguages", "@lessons"]);
    cy.contains("button", "AssembleTestLang").click();
  }

  it("shows Assembling… while queued/running, then downloads on ready", () => {
    let statusCallCount = 0;
    cy.intercept("POST", "/api/languages/999/quarters/Luke/2/assembly", {
      statusCode: 202,
      body: { jobId: "job-1", status: "queued" },
    }).as("startAssembly");

    cy.intercept("GET", "/api/languages/999/quarters/Luke/2/assembly?mode=bilingual", (req) => {
      statusCallCount += 1;
      req.reply({
        statusCode: 200,
        body:
          statusCallCount === 1
            ? { jobId: "job-1", status: "queued" }
            : { jobId: "job-1", status: "ready" },
      });
    }).as("pollStatus");

    cy.intercept("GET", "/api/assembly/job-1/download", {
      statusCode: 200,
      headers: { "content-type": "application/vnd.oasis.opendocument.text" },
      body: "fake-odt-bytes",
    }).as("download");

    visitLanguagePage();

    cy.contains("tr", "Luke 2").within(() => {
      cy.contains("button", "Bilingual").click();
    });

    cy.wait("@startAssembly");

    // Queued/running: aria-live status region announces "Assembling…" and
    // the control is aria-disabled (not disabled — stays focusable).
    cy.get("div[role='status']").should("contain.text", "Assembling…");
    cy.contains("tr", "Luke 2").within(() => {
      cy.get("button[aria-disabled='true']").should("exist");
    });

    cy.wait("@pollStatus");
    cy.wait("@download");

    cy.get("div[role='status']").should("contain.text", "Ready — file downloaded.");
  });

  it("attaches a rapid double-click to the same job (no duplicate start)", () => {
    let postCount = 0;
    cy.intercept("POST", "/api/languages/999/quarters/Luke/2/assembly", (req) => {
      postCount += 1;
      req.reply({
        statusCode: 202,
        body: { jobId: "job-2", status: "queued" },
      });
    }).as("startAssembly");

    cy.intercept("GET", "/api/languages/999/quarters/Luke/2/assembly?mode=bilingual", {
      statusCode: 200,
      body: { jobId: "job-2", status: "queued" },
    }).as("pollStatus");

    visitLanguagePage();

    cy.contains("tr", "Luke 2").within(() => {
      cy.contains("button", "Bilingual").click().click({ force: true }).click({ force: true });
    });

    cy.wait("@startAssembly");
    // Give any errant second POST a chance to fire before asserting the count.
    cy.wait("@pollStatus").then(() => {
      cy.wrap(postCount).should("eq", 1);
    });
  });
});
