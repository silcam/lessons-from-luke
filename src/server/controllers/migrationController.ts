import { Express } from "express";
import { Persistence } from "../../core/interfaces/Persistence";
import { legacyProjects, legacyTStrings } from "../storage/legacyStorage";
import { uniq, discriminate, insertSorted } from "../../core/util/arrayUtils";
import { TString } from "../../core/models/TString";
import { FRENCH_ID } from "../../core/models/Language";
import fs from "fs";
import { compareTwoStrings } from "string-similarity";
import {
  LegacyTStringWithMatches,
  LegacyTString
} from "../../core/models/Legacy";

export default function migrationController(
  app: Express,
  storage: Persistence
) {
  app.get("/api/admin/legacy/projects", async (req, res) => {
    res.json(legacyProjects());
  });

  type GetProjectResponse = {
    exactLegacyStrings: LegacyTStringWithMatches[];
    legacyStrings: LegacyTStringWithMatches[];
  };
  app.get("/api/admin/legacy/project/:datetime", async (req, res) => {
    try {
      const project = legacyProjects().find(
        prj => prj.datetime == parseInt(req.params.datetime)
      );
      if (!project) throw { status: 404 };

      const legacyStrings = uniq(
        stripScripture(legacyTStrings(project)),
        (a, b) => a.src == b.src
      );
      const frenchStrings = await getFrenchTStrings(storage);

      const response = legacyStrings.reduce(
        (accum: GetProjectResponse, legStr) => {
          const exact = frenchStrings.find(frStr => frStr.text == legStr.src);
          if (exact) {
            accum.exactLegacyStrings.push({ ...legStr, matches: [exact] });
          } else {
            accum.legacyStrings.push({
              ...legStr,
              matches: bestMatches(legStr, frenchStrings)
            });
          }
          return accum;
        },
        { exactLegacyStrings: [], legacyStrings: [] }
      );

      res.json(response);
    } catch (err) {
      res.status(err.status || 500).send("error");
    }
  });
}

function bestMatches(legStr: LegacyTString, frenchStrings: TString[]) {
  const max = 10;
  const punctuation = /[\.?!]/g;
  const legStrSrcWithPieces = punctuation.test(legStr.src)
    ? [legStr.src, ...legStr.src.split(punctuation)]
    : [legStr.src];
  const matches = frenchStrings.reduce((best: [TString, number][], frStr) => {
    const sim = Math.max(
      ...legStrSrcWithPieces.map(src => compareTwoStrings(src, frStr.text))
    );
    return insertSorted<[TString, number]>(
      best,
      [frStr, sim],
      (a, b) => a[1] > b[1]
    ).slice(0, max);
  }, []);
  return matches.map(match => match[0]);
}

function stripScripture(legacyStrings: LegacyTString[]) {
  return legacyStrings.filter(
    legacyString => !/^Luc \d+/.test(legacyString.src)
  );
}

async function getFrenchTStrings(storage: Persistence): Promise<TString[]> {
  // if (process.env.NODE_ENV == "test") {
  //   return JSON.parse(fs.readFileSync("frenchStrings.json").toString());
  // }
  return storage.tStrings({ languageId: FRENCH_ID });
}
