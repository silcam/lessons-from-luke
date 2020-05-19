import fs from "fs";
import { TString } from "../../core/models/TString";
import { FRENCH_ID } from "../../core/models/Language";

const dbOutput = fs
  .readFileSync("/Users/rick/Desktop/french_strings")
  .toString();
const tStrings: TString[] = [];
dbOutput
  .split("\n")
  .slice(1)
  .forEach(line => {
    const pieces = line.split("|");
    if (pieces.length > 3)
      tStrings.push({
        languageId: FRENCH_ID,
        masterId: parseInt(pieces[0]),
        text: pieces[4].trim(),
        history: []
      });
  });
fs.writeFileSync("frenchStrings.json", JSON.stringify(tStrings));
