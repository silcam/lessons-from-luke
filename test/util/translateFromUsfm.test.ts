import fs from "fs";
import translateFromUsfm from "../../src/util/translateFromUsfm";

const sampleUSFM = fs.readFileSync("test/data/43LUKBMO.SFM").toString();

const sampleTStrings = [
  {
    id: 3,
    xpath: "",
    src: "Luc 1, 5-25",
    targetText: ""
  },
  {
    id: 95,
    xpath: "",
    src:
      "Luc 1, 4-7 [La première histoire dans l’Évangile de Luc est celle d'un prêtre nommé Zacharie. Sa femme Élisabeth et lui étaient de bonnes personnes. Tous deux étaient pieux et vivaient sous le regard de Dieu. Ils observaient fidèlement tous les commandements du Seigneur et leur conduite était irréprochable.  Ils vivaient sans enfant ; car Élisabeth ne pouvait pas en avoir et tous deux étaient déjà très âgés. Malgré tout, cela ne changea rien à leur amour pour Dieu et leur obéissance. Ils savaient que Dieu entend nos prières. ]",
    targetText: "",
    mtString: true
  },
  {
    id: 99,
    xpath: "",
    src:
      "Luc 1.46-48  Un jour, alors que la classe (d’Abia) était chargée des fonctions sacerdotales, Zacharie assurait son service devant Dieu. En effet, suivant la coutume des prêtres, il avait été désigné par le sort pour offrir l’encens dans le sanctuaire du Seigneur. C’était l’heure de l’offrande des parfums et toute la multitude des fidèles se tenait dehors, (dans le parvis), pour prier. Tout à coup, un ange du Seigneur apparut, debout à la droite de l’autel des parfums. Quand Zacharie, le vit, il fut troublé et la peur s’empara de lui.",
    targetText: "",
    mtString: true
  },
  {
    id: 100,
    xpath: "",
    src:
      "Luc 2:49  Un jour, alors que la classe (d’Abia) était chargée des fonctions sacerdotales, Zacharie assurait son service devant Dieu. En effet, suivant la coutume des prêtres, il avait été désigné par le sort pour offrir l’encens dans le sanctuaire du Seigneur. C’était l’heure de l’offrande des parfums et toute la multitude des fidèles se tenait dehors, (dans le parvis), pour prier. Tout à coup, un ange du Seigneur apparut, debout à la droite de l’autel des parfums. Quand Zacharie, le vit, il fut troublé et la peur s’empara de lui.",
    targetText: "",
    mtString: true
  },
  {
    id: 101,
    xpath: "",
    src:
      "Luc 3.20-21  Un jour, alors que la classe (d’Abia) était chargée des fonctions sacerdotales, Zacharie assurait son service devant Dieu. En effet, suivant la coutume des prêtres, il avait été désigné par le sort pour offrir l’encens dans le sanctuaire du Seigneur. C’était l’heure de l’offrande des parfums et toute la multitude des fidèles se tenait dehors, (dans le parvis), pour prier. Tout à coup, un ange du Seigneur apparut, debout à la droite de l’autel des parfums. Quand Zacharie, le vit, il fut troublé et la peur s’empara de lui.",
    targetText: "",
    mtString: true
  },
  {
    id: 102,
    xpath: "",
    src:
      "Luc 24.53  Un jour, alors que la classe (d’Abia) était chargée des fonctions sacerdotales, Zacharie assurait son service devant Dieu. En effet, suivant la coutume des prêtres, il avait été désigné par le sort pour offrir l’encens dans le sanctuaire du Seigneur. C’était l’heure de l’offrande des parfums et toute la multitude des fidèles se tenait dehors, (dans le parvis), pour prier. Tout à coup, un ange du Seigneur apparut, debout à la droite de l’autel des parfums. Quand Zacharie, le vit, il fut troublé et la peur s’empara de lui.",
    targetText: "",
    mtString: true
  }
];

test("USFM Translate: A few valid refs", () => {
  const result = translateFromUsfm(sampleTStrings, sampleUSFM).tStrings;
  expect(result[0].targetText.length).toBe(0);
  expect(result[1].targetText).toEqual(
    "Luc 1, 4-7 nɛnnɛ ŋa mimfɛ ɔ ya nji shishiʼi pa nnu haʼaŋ pi shwei ghɔ nɔ nɛ. A ni mbɔ thɔ Hɛrɔ, mbɔ fùoŋ Judia, yichəɨ ŋgaŋ fɛʼiŋgiɛŋ Minnwi ni mbɔ fɔ, ligi yi pɔ Shakaria. A ni ndhɔ moŋ ghrà ghaŋ fɛʼiŋgiɛŋ Minnwi, llɔ moŋ ndaaŋoŋ Abija. A ni mfāʼo ŋgwɛ vi llɔ moŋ ŋgwrɛiŋoŋ Ɛroŋ, ligi yi ni mbɔ Ɛlishabe. Ŋguoŋ vugu ni mbɔ ŋgwa ndɨndɨ shhɨ Minnwi, nthɔ nūʼɔŋ ŋguoŋ kɨ̀na pugu pa gɨ́ Taathɔ ndɔ ki lɔ mfāʼo ntəɨ. Ndɔ paʼa pugu lɔ njiʼi fāʼo muuŋ, nthɛ ŋa Ɛlishabe ni mbɔ pi ŋkhwɛ̄, ndɔ pugu ni ŋkwo ya ndunu."
  );
  expect(result[2].targetText).toEqual(
    "Luc 1.46-48 Meri khwɛ̄ ŋa, “Ǹchhu ni ŋguoŋ njùʼɔ a ŋa ndighaʼo pɔ ni Taathɔ. Mbɨnɨ mfāʼo pwanjuʼɔ nthɛ Minnwi mbɔ ŋkwe a, nthɛ ŋa a kwiŋ muuŋ fàʼa yi, yi juju. Līi njəɨ, llɔ ndwɛ ŋgə̄ɨ nu shhɨ ŋguoŋ ŋgwrɛiŋgwa shi mɛ̄iŋ a ni mbrɔthɔ."
  );
  expect(result[3].targetText).toEqual(
    "Luc 2:49 A chhu ni pugu ŋa, “Pəɨ nì nthɔ ntāʼa a ŋa? Pəɨ shi ki lɔ nji ŋa m̀fāʼo nɔ pɔ nu nda Tǎa a?”"
  );
  expect(result[4].targetText).toEqual(
    "Luc 3.20-21 Hɛrɔ pɨnɨ mbīgi phɨ yi nɔ fɨ̄nɨ nu Jouŋ. Ŋkaoŋ Jouŋ maa ŋgə̄ɨ chə́ɨŋ, ndɨɨ ŋa ŋguoŋ ŋgwa ni ŋkwo kwe ŋkhǐ nɛ, Jishɔ kwe ŋkaa yu, ŋga nchhɔ nduoŋ Minnwi, po ŋaʼaŋ,"
  );
  expect(result[5].targetText).toEqual(
    "Luc 24.53 Pugu ni ŋkɨna moŋ Nda Minnwi ŋguoŋ llɛ́ nthɔ ntōo Minnwi."
  );
});

test("USFM Errors", () => {
  const noIdUsfm = sampleUSFM.slice(34);
  expect(() => {
    translateFromUsfm(sampleTStrings, noIdUsfm);
  }).toThrow("USFM Parse Error - \\id not found");
  const badBookUsfm = sampleUSFM.replace("LUK", "MAT");
  expect(() => {
    translateFromUsfm(sampleTStrings, badBookUsfm);
  }).toThrow("File not for Luke or Acts");
});

test("Reference Errors", () => {
  const badChapterTStrings = [
    {
      ...sampleTStrings[5],
      src: sampleTStrings[5].src.replace("Luc 24.53", "Luc 25.1")
    }
  ];
  expect(translateFromUsfm(badChapterTStrings, sampleUSFM).errors[0]).toEqual(
    "USFM Parse Error - Chapter 25 not found."
  );
  const badVerseTStrings = [
    {
      ...badChapterTStrings[0],
      src: badChapterTStrings[0].src.replace("Luc 25.1", "Luc 1.81")
    }
  ];
  expect(translateFromUsfm(badVerseTStrings, sampleUSFM).errors[0]).toEqual(
    "USFM Parse Error - Verse 81 not found in chapter 1."
  );
});

test("USFM translate Overwrite flag", () => {
  const alreadyTranslated = [
    { ...sampleTStrings[1], targetText: "Already Translated!" }
  ];
  expect(
    translateFromUsfm(alreadyTranslated, sampleUSFM).tStrings[0].targetText
  ).toEqual("Already Translated!");
  expect(
    translateFromUsfm(alreadyTranslated, sampleUSFM, { overwrite: true })
      .tStrings[0].targetText
  ).toEqual(
    "Luc 1, 4-7 nɛnnɛ ŋa mimfɛ ɔ ya nji shishiʼi pa nnu haʼaŋ pi shwei ghɔ nɔ nɛ. A ni mbɔ thɔ Hɛrɔ, mbɔ fùoŋ Judia, yichəɨ ŋgaŋ fɛʼiŋgiɛŋ Minnwi ni mbɔ fɔ, ligi yi pɔ Shakaria. A ni ndhɔ moŋ ghrà ghaŋ fɛʼiŋgiɛŋ Minnwi, llɔ moŋ ndaaŋoŋ Abija. A ni mfāʼo ŋgwɛ vi llɔ moŋ ŋgwrɛiŋoŋ Ɛroŋ, ligi yi ni mbɔ Ɛlishabe. Ŋguoŋ vugu ni mbɔ ŋgwa ndɨndɨ shhɨ Minnwi, nthɔ nūʼɔŋ ŋguoŋ kɨ̀na pugu pa gɨ́ Taathɔ ndɔ ki lɔ mfāʼo ntəɨ. Ndɔ paʼa pugu lɔ njiʼi fāʼo muuŋ, nthɛ ŋa Ɛlishabe ni mbɔ pi ŋkhwɛ̄, ndɔ pugu ni ŋkwo ya ndunu."
  );
});

test("USFM translate Book Mismatch", () => {
  const actsTStrings = [
    { ...sampleTStrings[1], src: sampleTStrings[1].src.replace("Luc", "Actes") }
  ];
  expect(
    translateFromUsfm(actsTStrings, sampleUSFM).tStrings[0].targetText
  ).toEqual("");
});

test("USFM translate Other Books/Languages", () => {
  const lukeTStrings = [
    {
      ...sampleTStrings[3],
      src: sampleTStrings[3].src.replace("Luc 2:49", "Luke 2:49")
    }
  ];
  expect(
    translateFromUsfm(lukeTStrings, sampleUSFM).tStrings[0].targetText
  ).toEqual(
    "Luke 2:49 A chhu ni pugu ŋa, “Pəɨ nì nthɔ ntāʼa a ŋa? Pəɨ shi ki lɔ nji ŋa m̀fāʼo nɔ pɔ nu nda Tǎa a?”"
  );

  const actsUSFM = sampleUSFM.replace("LUK", "ACT");
  const actesTStrings = [
    { ...sampleTStrings[1], src: sampleTStrings[1].src.replace("Luc", "Actes") }
  ];
  expect(
    translateFromUsfm(actesTStrings, actsUSFM).tStrings[0].targetText
  ).toEqual(
    "Actes 1, 4-7 nɛnnɛ ŋa mimfɛ ɔ ya nji shishiʼi pa nnu haʼaŋ pi shwei ghɔ nɔ nɛ. A ni mbɔ thɔ Hɛrɔ, mbɔ fùoŋ Judia, yichəɨ ŋgaŋ fɛʼiŋgiɛŋ Minnwi ni mbɔ fɔ, ligi yi pɔ Shakaria. A ni ndhɔ moŋ ghrà ghaŋ fɛʼiŋgiɛŋ Minnwi, llɔ moŋ ndaaŋoŋ Abija. A ni mfāʼo ŋgwɛ vi llɔ moŋ ŋgwrɛiŋoŋ Ɛroŋ, ligi yi ni mbɔ Ɛlishabe. Ŋguoŋ vugu ni mbɔ ŋgwa ndɨndɨ shhɨ Minnwi, nthɔ nūʼɔŋ ŋguoŋ kɨ̀na pugu pa gɨ́ Taathɔ ndɔ ki lɔ mfāʼo ntəɨ. Ndɔ paʼa pugu lɔ njiʼi fāʼo muuŋ, nthɛ ŋa Ɛlishabe ni mbɔ pi ŋkhwɛ̄, ndɔ pugu ni ŋkwo ya ndunu."
  );
  const actsTStrings = [
    {
      ...sampleTStrings[3],
      src: sampleTStrings[3].src.replace("Luc 2:49", "Acts 2:49")
    }
  ];
  expect(
    translateFromUsfm(actsTStrings, actsUSFM).tStrings[0].targetText
  ).toEqual(
    "Acts 2:49 A chhu ni pugu ŋa, “Pəɨ nì nthɔ ntāʼa a ŋa? Pəɨ shi ki lɔ nji ŋa m̀fāʼo nɔ pɔ nu nda Tǎa a?”"
  );
});

test("USFM Translator only translates MTStrings", () => {
  const notMTStrings = [
    {
      ...sampleTStrings[5],
      mtString: false
    }
  ];
  expect(
    translateFromUsfm(notMTStrings, sampleUSFM).tStrings[0].targetText
  ).toEqual("");
});

const mvSampleTStrings = [
  {
    id: 1,
    xpath: "",
    src: "Luc 6.47-48 Words",
    targetText: "",
    mtString: true
  },
  {
    id: 2,
    xpath: "",
    src: "Luc 6.46-48 Words",
    targetText: "",
    mtString: true
  },
  {
    id: 3,
    xpath: "",
    src: "Luc 6.47-49 Words",
    targetText: "",
    mtString: true
  },
  {
    id: 4,
    xpath: "",
    src: "Luc 6.46-47 Words",
    targetText: "",
    mtString: true
  },
  {
    id: 5,
    xpath: "",
    src: "Luc 6.48-49 Words",
    targetText: "",
    mtString: true
  }
];

test("USFM Translator multiverse marker", () => {
  const result = translateFromUsfm(mvSampleTStrings, sampleUSFM);
  const newTStrings = result.tStrings;
  expect(newTStrings[0].targetText).toEqual(
    "Luc 6.47-48 Shesheŋoŋ ŋa a thɔ njəɨ a njaʼo nchrā a nchwīe ndɔ haʼaŋ ǹchhu nɛ, ǹshi nshwei ghɔ ni ŋkwaŋ yaoŋ ŋa a fhi nɛ. A pɔ nɔ ŋoŋ ŋa a gha nthɔ ŋkrao nda, nja ntou kwò yi a shhi, a nūʼɔŋ ŋkuoŋ ŋgùʼɔ. Nɨnəɨ gha mbɨ̄gəɨ, ŋkhǐ thɔ mbɨŋ nda ghɔ ndɔ paʼa ndɔ nchɨʼɨ vi nthɛ ŋa pi ni nja ŋkrao vi shiʼi."
  );
  expect(newTStrings[1].targetText).toEqual(
    "Luc 6.46-48 “A chwīe khɔ ɔ thɔ mɛ̄iŋ a ŋa, ‘Taathɔ, Taathɔ,’ ndɔ paʼa ndɔ nchwīe nnu ŋa ǹchhu vɛ nɛ? Shesheŋoŋ ŋa a thɔ njəɨ a njaʼo nchrā a nchwīe ndɔ haʼaŋ ǹchhu nɛ, ǹshi nshwei ghɔ ni ŋkwaŋ yaoŋ ŋa a fhi nɛ. A pɔ nɔ ŋoŋ ŋa a gha nthɔ ŋkrao nda, nja ntou kwò yi a shhi, a nūʼɔŋ ŋkuoŋ ŋgùʼɔ. Nɨnəɨ gha mbɨ̄gəɨ, ŋkhǐ thɔ mbɨŋ nda ghɔ ndɔ paʼa ndɔ nchɨʼɨ vi nthɛ ŋa pi ni nja ŋkrao vi shiʼi."
  );
  expect(newTStrings[2].targetText).toEqual(
    "Luc 6.47-49 Shesheŋoŋ ŋa a thɔ njəɨ a njaʼo nchrā a nchwīe ndɔ haʼaŋ ǹchhu nɛ, ǹshi nshwei ghɔ ni ŋkwaŋ yaoŋ ŋa a fhi nɛ. A pɔ nɔ ŋoŋ ŋa a gha nthɔ ŋkrao nda, nja ntou kwò yi a shhi, a nūʼɔŋ ŋkuoŋ ŋgùʼɔ. Nɨnəɨ gha mbɨ̄gəɨ, ŋkhǐ thɔ mbɨŋ nda ghɔ ndɔ paʼa ndɔ nchɨʼɨ vi nthɛ ŋa pi ni nja ŋkrao vi shiʼi. Ndɔ ti ŋoŋ ŋa a yaʼo chrà a ki lɔ nchwīe nɛ pɔ nɔ ŋoŋ ŋa a krao nda shhɛ ndɔ ki lɔ nūʼɔŋ kwò yi, nɨnəɨ gha mbɨ̄gəɨ, ŋkhǐ thɔ mbɨŋ nda ghɔ, a gū wuʼɔ ndɨɨ ghɔ nwīʼiŋ ghao.”"
  );
  expect(newTStrings[3].targetText).toEqual("");
  expect(result.errors[0]).toEqual(
    "USFM Parse Error - Verse 47 not found in chapter 6."
  );
  expect(newTStrings[4].targetText).toEqual("");
  expect(result.errors[1]).toEqual(
    "USFM Parse Error - Verse 48 not found in chapter 6."
  );
});
