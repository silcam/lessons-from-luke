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
      "Luc 1, 5-7 [La première histoire dans l’Évangile de Luc est celle d'un prêtre nommé Zacharie. Sa femme Élisabeth et lui étaient de bonnes personnes. Tous deux étaient pieux et vivaient sous le regard de Dieu. Ils observaient fidèlement tous les commandements du Seigneur et leur conduite était irréprochable.  Ils vivaient sans enfant ; car Élisabeth ne pouvait pas en avoir et tous deux étaient déjà très âgés. Malgré tout, cela ne changea rien à leur amour pour Dieu et leur obéissance. Ils savaient que Dieu entend nos prières. ]",
    targetText: "",
    mtString: true
  },
  {
    id: 99,
    xpath: "",
    src:
      "Luc 1, 8-21  Un jour, alors que la classe (d’Abia) était chargée des fonctions sacerdotales, Zacharie assurait son service devant Dieu. En effet, suivant la coutume des prêtres, il avait été désigné par le sort pour offrir l’encens dans le sanctuaire du Seigneur. C’était l’heure de l’offrande des parfums et toute la multitude des fidèles se tenait dehors, (dans le parvis), pour prier. Tout à coup, un ange du Seigneur apparut, debout à la droite de l’autel des parfums. Quand Zacharie, le vit, il fut troublé et la peur s’empara de lui.",
    targetText: "",
    mtString: true
  }
];

test("USFM Translate: A few valid refs", () => {
  const result = translateFromUsfm(sampleTStrings, sampleUSFM);
  expect(result[1].targetText).toEqual(
    "Luc 1, 5-7 A ni mbɔ thɔ Hɛrɔ, mbɔ fùoŋ Judia, yichəɨ ŋgaŋ fɛʼiŋgiɛŋ Minnwi ni mbɔ fɔ, ligi yi pɔ Shakaria. A ni ndhɔ moŋ ghrà ghaŋ fɛʼiŋgiɛŋ Minnwi, llɔ moŋ ndaaŋoŋ Abija. A ni mfāʼo ŋgwɛ vi llɔ moŋ ŋgwrɛiŋoŋ Ɛroŋ, ligi yi ni mbɔ Ɛlishabe. Ŋguoŋ vugu ni mbɔ ŋgwa ndɨndɨ shhɨ Minnwi, nthɔ nūʼɔŋ ŋguoŋ kɨ̀na pugu pa gɨ́ Taathɔ ndɔ ki lɔ mfāʼo ntəɨ. Ndɔ paʼa pugu lɔ njiʼi fāʼo muuŋ, nthɛ ŋa Ɛlishabe ni mbɔ pi ŋkhwɛ̄, ndɔ pugu ni ŋkwo ya ndunu."
  );
});
