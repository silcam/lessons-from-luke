import fs from "fs";
import translateFromUsfm from "./translateFromUsfm";
import { TString } from "../../core/models/TString";
import { ENGLISH_ID } from "../../core/models/Language";

const sampleUSFM = fs.readFileSync("test/43LUKBMO.SFM").toString();

function englishTStrings(texts: string[]): TString[] {
  return texts.map((text, index) => ({
    text,
    masterId: index + 1,
    languageId: ENGLISH_ID,
    history: []
  }));
}
const sampleEngStrings = englishTStrings([
  "Luc 1, 5-25",

  "Luc 1, 4-7 [La première histoire dans l’Évangile de Luc est celle d'un prêtre nommé Zacharie. Sa femme Élisabeth et lui étaient de bonnes personnes. Tous deux étaient pieux et vivaient sous le regard de Dieu. Ils observaient fidèlement tous les commandements du Seigneur et leur conduite était irréprochable.  Ils vivaient sans enfant ; car Élisabeth ne pouvait pas en avoir et tous deux étaient déjà très âgés. Malgré tout, cela ne changea rien à leur amour pour Dieu et leur obéissance. Ils savaient que Dieu entend nos prières. ]",

  "Luc 1.46-48  Un jour, alors que la classe (d’Abia) était chargée des fonctions sacerdotales, Zacharie assurait son service devant Dieu. En effet, suivant la coutume des prêtres, il avait été désigné par le sort pour offrir l’encens dans le sanctuaire du Seigneur. C’était l’heure de l’offrande des parfums et toute la multitude des fidèles se tenait dehors, (dans le parvis), pour prier. Tout à coup, un ange du Seigneur apparut, debout à la droite de l’autel des parfums. Quand Zacharie, le vit, il fut troublé et la peur s’empara de lui.",

  "Luc 2:49  Un jour, alors que la classe (d’Abia) était chargée des fonctions sacerdotales, Zacharie assurait son service devant Dieu. En effet, suivant la coutume des prêtres, il avait été désigné par le sort pour offrir l’encens dans le sanctuaire du Seigneur. C’était l’heure de l’offrande des parfums et toute la multitude des fidèles se tenait dehors, (dans le parvis), pour prier. Tout à coup, un ange du Seigneur apparut, debout à la droite de l’autel des parfums. Quand Zacharie, le vit, il fut troublé et la peur s’empara de lui.",

  "Luc 3.20-21  Un jour, alors que la classe (d’Abia) était chargée des fonctions sacerdotales, Zacharie assurait son service devant Dieu. En effet, suivant la coutume des prêtres, il avait été désigné par le sort pour offrir l’encens dans le sanctuaire du Seigneur. C’était l’heure de l’offrande des parfums et toute la multitude des fidèles se tenait dehors, (dans le parvis), pour prier. Tout à coup, un ange du Seigneur apparut, debout à la droite de l’autel des parfums. Quand Zacharie, le vit, il fut troublé et la peur s’empara de lui.",

  "Luc 24.53  Un jour, alors que la classe (d’Abia) était chargée des fonctions sacerdotales, Zacharie assurait son service devant Dieu. En effet, suivant la coutume des prêtres, il avait été désigné par le sort pour offrir l’encens dans le sanctuaire du Seigneur. C’était l’heure de l’offrande des parfums et toute la multitude des fidèles se tenait dehors, (dans le parvis), pour prier. Tout à coup, un ange du Seigneur apparut, debout à la droite de l’autel des parfums. Quand Zacharie, le vit, il fut troublé et la peur s’empara de lui."
]);

test("USFM Translate: A few valid refs", () => {
  const result = translateFromUsfm(
    sampleEngStrings,
    sampleUSFM
  ).translations.map(tr => tr.text);
  expect(result[0]).toEqual(
    "Luka 1, 4-7 nɛnnɛ ŋa mimfɛ ɔ ya nji shishiʼi pa nnu haʼaŋ pi shwei ghɔ nɔ nɛ. A ni mbɔ thɔ Hɛrɔ, mbɔ fùoŋ Judia, yichəɨ ŋgaŋ fɛʼiŋgiɛŋ Minnwi ni mbɔ fɔ, ligi yi pɔ Shakaria. A ni ndhɔ moŋ ghrà ghaŋ fɛʼiŋgiɛŋ Minnwi, llɔ moŋ ndaaŋoŋ Abija. A ni mfāʼo ŋgwɛ vi llɔ moŋ ŋgwrɛiŋoŋ Ɛroŋ, ligi yi ni mbɔ Ɛlishabe. Ŋguoŋ vugu ni mbɔ ŋgwa ndɨndɨ shhɨ Minnwi, nthɔ nūʼɔŋ ŋguoŋ kɨ̀na pugu pa gɨ́ Taathɔ ndɔ ki lɔ mfāʼo ntəɨ. Ndɔ paʼa pugu lɔ njiʼi fāʼo muuŋ, nthɛ ŋa Ɛlishabe ni mbɔ pi ŋkhwɛ̄, ndɔ pugu ni ŋkwo ya ndunu."
  );
  expect(result[1]).toEqual(
    "Luka 1.46-48 Meri khwɛ̄ ŋa, “Ǹchhu ni ŋguoŋ njùʼɔ a ŋa ndighaʼo pɔ ni Taathɔ. Mbɨnɨ mfāʼo pwanjuʼɔ nthɛ Minnwi mbɔ ŋkwe a, nthɛ ŋa a kwiŋ muuŋ fàʼa yi, yi juju. Līi njəɨ, llɔ ndwɛ ŋgə̄ɨ nu shhɨ ŋguoŋ ŋgwrɛiŋgwa shi mɛ̄iŋ a ni mbrɔthɔ."
  );
  expect(result[2]).toEqual(
    "Luka 2:49 A chhu ni pugu ŋa, “Pəɨ nì nthɔ ntāʼa a ŋa? Pəɨ shi ki lɔ nji ŋa m̀fāʼo nɔ pɔ nu nda Tǎa a?”"
  );
  expect(result[3]).toEqual(
    "Luka 3.20-21 Hɛrɔ pɨnɨ mbīgi phɨ yi nɔ fɨ̄nɨ nu Jouŋ. Ŋkaoŋ Jouŋ maa ŋgə̄ɨ chə́ɨŋ, ndɨɨ ŋa ŋguoŋ ŋgwa ni ŋkwo kwe ŋkhǐ nɛ, Jishɔ kwe ŋkaa yu, ŋga nchhɔ nduoŋ Minnwi, po ŋaʼaŋ,"
  );
  expect(result[4]).toEqual(
    "Luka 24.53 Pugu ni ŋkɨna moŋ Nda Minnwi ŋguoŋ llɛ́ nthɔ ntōo Minnwi."
  );
});

test("USFM Errors", () => {
  const noIdUsfm = sampleUSFM.slice(34);
  expect(() => {
    translateFromUsfm(sampleEngStrings, noIdUsfm);
  }).toThrow("USFM Parse Error - \\id not found");
  const badBookUsfm = sampleUSFM.replace("LUK", "MAT");
  expect(() => {
    translateFromUsfm(sampleEngStrings, badBookUsfm);
  }).toThrow("File not for Luke or Acts");
});

test("Reference Errors", () => {
  const badChapterTStrings = [
    {
      ...sampleEngStrings[5],
      text: sampleEngStrings[5].text.replace("Luc 24.53", "Luc 25.1")
    }
  ];
  expect(translateFromUsfm(badChapterTStrings, sampleUSFM).errors[0]).toEqual(
    "USFM Parse Error - Chapter 25 not found."
  );
  const badVerseTStrings = [
    {
      ...badChapterTStrings[0],
      text: badChapterTStrings[0].text.replace("Luc 25.1", "Luc 1.81")
    }
  ];
  expect(translateFromUsfm(badVerseTStrings, sampleUSFM).errors[0]).toEqual(
    "USFM Parse Error - Verse 81 not found in chapter 1."
  );
});

// test("USFM translate Overwrite flag", () => {
//   const alreadyTranslated = [
//     { ...sampleEngStrings[1], targetText: "Already Translated!" }
//   ];
//   expect(
//     translateFromUsfm(alreadyTranslated, sampleUSFM).translations["1"]
//   ).toBeUndefined();
//   expect(
//     translateFromUsfm(alreadyTranslated, sampleUSFM, { overwrite: true })
//       .translations["1"]
//   ).toEqual(
//     "Luka 1, 4-7 nɛnnɛ ŋa mimfɛ ɔ ya nji shishiʼi pa nnu haʼaŋ pi shwei ghɔ nɔ nɛ. A ni mbɔ thɔ Hɛrɔ, mbɔ fùoŋ Judia, yichəɨ ŋgaŋ fɛʼiŋgiɛŋ Minnwi ni mbɔ fɔ, ligi yi pɔ Shakaria. A ni ndhɔ moŋ ghrà ghaŋ fɛʼiŋgiɛŋ Minnwi, llɔ moŋ ndaaŋoŋ Abija. A ni mfāʼo ŋgwɛ vi llɔ moŋ ŋgwrɛiŋoŋ Ɛroŋ, ligi yi ni mbɔ Ɛlishabe. Ŋguoŋ vugu ni mbɔ ŋgwa ndɨndɨ shhɨ Minnwi, nthɔ nūʼɔŋ ŋguoŋ kɨ̀na pugu pa gɨ́ Taathɔ ndɔ ki lɔ mfāʼo ntəɨ. Ndɔ paʼa pugu lɔ njiʼi fāʼo muuŋ, nthɛ ŋa Ɛlishabe ni mbɔ pi ŋkhwɛ̄, ndɔ pugu ni ŋkwo ya ndunu."
//   );
// });

test("USFM translate Book Mismatch", () => {
  const actsTStrings = [
    {
      ...sampleEngStrings[1],
      text: sampleEngStrings[1].text.replace("Luc", "Actes")
    }
  ];
  expect(translateFromUsfm(actsTStrings, sampleUSFM).translations.length).toBe(
    0
  );
});

test("USFM translate Other Books/Languages", () => {
  const noHdrUsfm = sampleUSFM.replace(/^\\h .+/m, "");
  const lukeTStrings = [
    {
      ...sampleEngStrings[3],
      text: sampleEngStrings[3].text.replace("Luc 2:49", "Luke 2:49")
    }
  ];
  expect(
    translateFromUsfm(lukeTStrings, noHdrUsfm).translations[0].text
  ).toEqual(
    "Luke 2:49 A chhu ni pugu ŋa, “Pəɨ nì nthɔ ntāʼa a ŋa? Pəɨ shi ki lɔ nji ŋa m̀fāʼo nɔ pɔ nu nda Tǎa a?”"
  );

  const actsUSFM = noHdrUsfm.replace("LUK", "ACT");
  const actesTStrings = [
    {
      ...sampleEngStrings[1],
      text: sampleEngStrings[1].text.replace("Luc", "Actes")
    }
  ];
  expect(
    translateFromUsfm(actesTStrings, actsUSFM).translations[0].text
  ).toEqual(
    "Actes 1, 4-7 nɛnnɛ ŋa mimfɛ ɔ ya nji shishiʼi pa nnu haʼaŋ pi shwei ghɔ nɔ nɛ. A ni mbɔ thɔ Hɛrɔ, mbɔ fùoŋ Judia, yichəɨ ŋgaŋ fɛʼiŋgiɛŋ Minnwi ni mbɔ fɔ, ligi yi pɔ Shakaria. A ni ndhɔ moŋ ghrà ghaŋ fɛʼiŋgiɛŋ Minnwi, llɔ moŋ ndaaŋoŋ Abija. A ni mfāʼo ŋgwɛ vi llɔ moŋ ŋgwrɛiŋoŋ Ɛroŋ, ligi yi ni mbɔ Ɛlishabe. Ŋguoŋ vugu ni mbɔ ŋgwa ndɨndɨ shhɨ Minnwi, nthɔ nūʼɔŋ ŋguoŋ kɨ̀na pugu pa gɨ́ Taathɔ ndɔ ki lɔ mfāʼo ntəɨ. Ndɔ paʼa pugu lɔ njiʼi fāʼo muuŋ, nthɛ ŋa Ɛlishabe ni mbɔ pi ŋkhwɛ̄, ndɔ pugu ni ŋkwo ya ndunu."
  );
  const actsTStrings = [
    {
      ...sampleEngStrings[3],
      text: sampleEngStrings[3].text.replace("Luc 2:49", "Acts 2:49")
    }
  ];
  expect(
    translateFromUsfm(actsTStrings, actsUSFM).translations[0].text
  ).toEqual(
    "Acts 2:49 A chhu ni pugu ŋa, “Pəɨ nì nthɔ ntāʼa a ŋa? Pəɨ shi ki lɔ nji ŋa m̀fāʼo nɔ pɔ nu nda Tǎa a?”"
  );
});

// test("USFM Translator only translates MTStrings", () => {
//   const notMTStrings = [
//     {
//       ...sampleEngStrings[5],
//       mtString: false
//     }
//   ];
//   expect(
//     translateFromUsfm(notMTStrings, sampleUSFM).translations
//   ).toEqual([]);
// });

const mvSampleTStrings = englishTStrings([
  "Luc 6.47-48 Words",
  "Luc 6.46-48 Words",
  "Luc 6.47-49 Words",
  "Luc 6.46-47 Words",
  "Luc 6.48-49 Words"
]);

test("USFM Translator multiverse marker", () => {
  const result = translateFromUsfm(mvSampleTStrings, sampleUSFM);
  const translations = result.translations.map(tr => tr.text);
  expect(translations[0]).toEqual(
    "Luka 6.47-48 Shesheŋoŋ ŋa a thɔ njəɨ a njaʼo nchrā a nchwīe ndɔ haʼaŋ ǹchhu nɛ, ǹshi nshwei ghɔ ni ŋkwaŋ yaoŋ ŋa a fhi nɛ. A pɔ nɔ ŋoŋ ŋa a gha nthɔ ŋkrao nda, nja ntou kwò yi a shhi, a nūʼɔŋ ŋkuoŋ ŋgùʼɔ. Nɨnəɨ gha mbɨ̄gəɨ, ŋkhǐ thɔ mbɨŋ nda ghɔ ndɔ paʼa ndɔ nchɨʼɨ vi nthɛ ŋa pi ni nja ŋkrao vi shiʼi."
  );
  expect(translations[1]).toEqual(
    "Luka 6.46-48 “A chwīe khɔ ɔ thɔ mɛ̄iŋ a ŋa, ‘Taathɔ, Taathɔ,’ ndɔ paʼa ndɔ nchwīe nnu ŋa ǹchhu vɛ nɛ? Shesheŋoŋ ŋa a thɔ njəɨ a njaʼo nchrā a nchwīe ndɔ haʼaŋ ǹchhu nɛ, ǹshi nshwei ghɔ ni ŋkwaŋ yaoŋ ŋa a fhi nɛ. A pɔ nɔ ŋoŋ ŋa a gha nthɔ ŋkrao nda, nja ntou kwò yi a shhi, a nūʼɔŋ ŋkuoŋ ŋgùʼɔ. Nɨnəɨ gha mbɨ̄gəɨ, ŋkhǐ thɔ mbɨŋ nda ghɔ ndɔ paʼa ndɔ nchɨʼɨ vi nthɛ ŋa pi ni nja ŋkrao vi shiʼi."
  );
  expect(translations[2]).toEqual(
    "Luka 6.47-49 Shesheŋoŋ ŋa a thɔ njəɨ a njaʼo nchrā a nchwīe ndɔ haʼaŋ ǹchhu nɛ, ǹshi nshwei ghɔ ni ŋkwaŋ yaoŋ ŋa a fhi nɛ. A pɔ nɔ ŋoŋ ŋa a gha nthɔ ŋkrao nda, nja ntou kwò yi a shhi, a nūʼɔŋ ŋkuoŋ ŋgùʼɔ. Nɨnəɨ gha mbɨ̄gəɨ, ŋkhǐ thɔ mbɨŋ nda ghɔ ndɔ paʼa ndɔ nchɨʼɨ vi nthɛ ŋa pi ni nja ŋkrao vi shiʼi. Ndɔ ti ŋoŋ ŋa a yaʼo chrà a ki lɔ nchwīe nɛ pɔ nɔ ŋoŋ ŋa a krao nda shhɛ ndɔ ki lɔ nūʼɔŋ kwò yi, nɨnəɨ gha mbɨ̄gəɨ, ŋkhǐ thɔ mbɨŋ nda ghɔ, a gū wuʼɔ ndɨɨ ghɔ nwīʼiŋ ghao.”"
  );
  expect(translations[3]).toBeUndefined();
  expect(result.errors[0]).toEqual(
    "USFM Parse Error - Verse 47 not found in chapter 6."
  );
  expect(translations[4]).toBeUndefined();
  expect(result.errors[1]).toEqual(
    "USFM Parse Error - Verse 48 not found in chapter 6."
  );
});

test("Multiword MT Book Name", () => {
  const usfm2 = sampleUSFM.replace(/^\\h .+/m, "\\h 2 Luka");
  const result = translateFromUsfm(sampleEngStrings, usfm2);
  expect(result.translations[1].text).toContain("2 Luka");
});
