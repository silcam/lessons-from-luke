describe("Admin Languages", () => {
  before(() => {
    cy.loadFixtures();
  });

  beforeEach(cy.login);

  it("Adds a language", () => {
    cy.visit("/");
    cy.contains("button", "Add Language").click();
    cy.inLabel("Source Language").select("Français");
    cy.placeholder("Language Name").type("German");
    cy.contains("button", "Save").click();
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
    cy.fixture("43LUKBMO.SFM").then(fileContent => {
      cy.get("input[type='file']")
        .parent()
        .upload(
          {
            fileContent,
            fileName: "43LUKBMO.SFM",
            mimeType: "text/plain",
            encoding: "utf-8"
          },
          { subjectType: "drag-n-drop" }
        );
    });
    cy.contains("button", "43LUKBMO.SFM").should("exist");
    cy.contains("Save").click();
    cy.url().should("eq", "http://localhost:8080/usfmImportResult");
    cy.contains("Luka 1:5-7 A ni mbɔ thɔ Hɛrɔ,").should("exist");
  });

  it("Imports ODT", () => {
    cy.visit("/");
    cy.contains("Français").click();
    cy.contains("Upload Document").click();
    cy.fixture("Français_Luke-T1-L01.odt", "base64").then(fileContent => {
      cy.get("input[type='file']")
        .parent()
        .upload(
          {
            fileContent,
            fileName: "Français_Luke-T1-L01.odt",
            mimeType: "application/vnd.oasis.opendocument.text",
            encoding: "base64"
          },
          { subjectType: "drag-n-drop" }
        );
    });
    cy.contains("button", "Français_Luke-T1-L01.odt").should("exist");
    cy.inLabel("Lesson").should("have.value", "11");
    cy.contains("button", "Upload").click();

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
