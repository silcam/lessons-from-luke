describe("Admin Languages", () => {
  beforeEach(cy.login);

  it("Adds a language", () => {
    cy.visit("/");
    cy.contains("button", "Add Language").click();
    cy.inLabel("Source Language").select("Français");
    cy.placeholder("Language Name").type("German");
    cy.intercept("POST", "/api/admin/languages").as("saveLanguage");
    cy.contains("button", "Save").click();
    cy.wait("@saveLanguage");
    cy.contains("button", "German").should("exist");
  });

  it("Toggles Mother Tongue", () => {
    cy.visit("/");
    cy.contains("button", "Batanga").click();
    cy.inLabel("Mother Tongue").should("be.checked");
    cy.inLabel("Mother Tongue").click();
    cy.inLabel("Mother Tongue").should("not.be.checked");

    cy.visit("/");
    cy.contains("button", "Batanga").click();
    cy.inLabel("Mother Tongue").should("not.be.checked");
  });

  it("Links to translate", () => {
    cy.visit("/");
    cy.contains("button", "Batanga").click();
    cy.contains("a", "Translate").click();
    cy.url().should("eq", "http://localhost:8080/translate/GHI");
    cy.contains("h1", "Batanga").should("exist");
  });

  it("Imports USFM", () => {
    cy.visit("/");
    cy.contains("button", "Batanga").click();
    cy.contains("Upload USFM").click();
    cy.fixture("43LUKBMO.SFM", "base64").then(fileContent => {
      cy.get("input[type='file']").selectFile(
        { contents: Cypress.Buffer.from(fileContent, "base64"), fileName: "43LUKBMO.SFM", mimeType: "text/plain" },
        { action: "drag-drop", force: true }
      );
    });
    cy.contains("button", "43LUKBMO.SFM").should("exist");
    cy.intercept("POST", /\/api\/admin\/languages\/\d+\/usfm/).as("importUsfm");
    cy.contains("Save").click();
    cy.wait("@importUsfm", { timeout: 30000 });
    cy.url().should("eq", "http://localhost:8080/usfmImportResult");
    cy.contains("Luka 1:5-7 A ni mbɔ thɔ Hɛrɔ,").should("exist");
  });

  it("Imports ODT", () => {
    cy.visit("/");
    cy.contains("Français").click();
    cy.contains("Upload Document").click();
    cy.fixture("Français_Luke-T1-L01.odt", "base64").then(fileContent => {
      cy.get("input[type='file']").selectFile(
        {
          contents: Cypress.Buffer.from(fileContent, "base64"),
          fileName: "Français_Luke-T1-L01.odt",
          mimeType: "application/vnd.oasis.opendocument.text"
        },
        { action: "drag-drop", force: true }
      );
    });
    cy.contains("button", "Français_Luke-T1-L01.odt").should("exist");
    cy.inLabel("Lesson").should("have.value", "11");
    cy.intercept("POST", "/api/admin/documents").as("uploadDoc");
    cy.contains("button", "Upload").click();
    cy.wait("@uploadDoc", { timeout: 30000 });

    cy.url().should(
      "eq",
      "http://localhost:8080/languages/2/lessons/11/docStrings"
    );

    // // Exercise Split button
    // const tooLong =
    //   "Prenez le temps de prier ensemble. Laissez les enfants prier à haute voix s'ils le veulent. Ne forcez personne à prier à haute voix.";
    // cy.contains("tr", tooLong).within(row => {
    //   cy.contains("Split")
    //     .invoke("show")
    //     .click();
    //   const leftArrow40 = new Array(40).fill("{leftarrow}").join("");
    //   cy.get("textarea").type(leftArrow40, { delay: 0 });
    //   cy.contains("button", "Split").click();
    //   cy.contains(
    //     "Prenez le temps de prier ensemble. Laissez les enfants prier à haute voix s'ils le veulent."
    //   );
    //   cy.contains(tooLong).should("not.exist");
    // });
    // cy.contains("tr", "Do not force anyone to pray out loud.").contains(
    //   "Ne forcez personne à prier à haute voix."
    // );

    // // Exercise Merge button
    // cy.contains("tr", "SAVOIR :").within(row => {
    //   cy.contains("Merge Next with Space")
    //     .invoke("show")
    //     .click();
    //   cy.contains(
    //     "SAVOIR : Les enfants sauront que Dieu entend leurs prières."
    //   );
    // });
    // cy.contains("tr", "SAVOIR :")
    //   .next()
    //   .contains("FAIRE");

    // cy.contains("button", "Save").click();
    // cy.url().should("eq", "http://localhost:8080/");
    // cy.visit("/translate/DEF");
    // cy.contains(
    //   "Prière : Parler avec Dieu. Où peut-on prier? Quelles sont les choses qu'on peut faire tout en priant? Devons-nous utiliser un langage ou une voix spéciale quand nous prions?"
    // );
  });

  it("Rejects non-USFM file upload", () => {
    cy.visit("/");
    cy.contains("button", "Batanga").click();
    cy.contains("Upload USFM").click();
    cy.get("input[type='file']").selectFile(
      {
        contents: Cypress.Buffer.from("This is not valid USFM content"),
        fileName: "not-usfm.txt",
        mimeType: "text/plain"
      },
      { action: "drag-drop", force: true }
    );
    cy.contains("button", "not-usfm.txt").should("exist");
    cy.intercept("POST", /\/api\/admin\/languages\/\d+\/usfm/).as("importUsfm");
    cy.contains("Save").click();
    cy.wait("@importUsfm", { timeout: 10000 });
    // Invalid USFM causes a server error; user should not reach the import result page
    cy.url().should("not.include", "usfmImportResult");
    cy.contains("Server Error").should("exist");
  });

  it("Rejects non-ODT file for document upload", () => {
    cy.visit("/");
    cy.contains("Français").click();
    cy.contains("Upload Document").click();
    // The ODT dropzone enforces accept="application/vnd.oasis.opendocument.text";
    // a PDF file should be silently rejected before reaching the server
    cy.get("input[type='file']").selectFile(
      {
        contents: Cypress.Buffer.from("not an odt file"),
        fileName: "invalid.pdf",
        mimeType: "application/pdf"
      },
      { action: "drag-drop", force: true }
    );
    // File was rejected by dropzone — the filename button should NOT appear
    cy.contains("button", "invalid.pdf").should("not.exist");
    // Upload button remains disabled since no valid file was accepted
    cy.contains("button", "Upload").should("be.disabled");
  });

  // it("Downloads Documents", () => {
  //   cy.visit("/");
  //   cy.contains("button", "Batanga").click();
  //   cy.contains("tr", "Luke 1-1").within(tr => {
  //     cy.contains("button", "Download").click();
  //     cy.contains("button", "Download").should("not.exist");
  //     cy.contains("td", "Download").should("exist");
  //     cy.contains("button", "Download").should("exist");
  //   });
  // });
});
