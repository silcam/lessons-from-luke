import PGStorage from "../storage/PGStorage";
import { ENGLISH_ID } from "../../core/models/Language";
import { uniq } from "../../core/util/arrayUtils";
import { equal, sqlizeTString } from "../../core/models/TString";

class PGStorageCleaner extends PGStorage {
  async cleanDB() {
    await this.removeSuperfluous();
    await this.removeDuplicates();
    await this.consolidateEnglish();
    await this.updateProgress();
    console.log("DONE");
    return null;
  }

  async removeSuperfluous() {
    // Remove TStrings that are not referenced by any LessonString
    console.log("Removing superfluous strings...");
    await this.sql`
    DELETE FROM tstrings 
    WHERE masterid NOT IN (SELECT masterid from lessonstrings);`;
    console.log("...done");
  }

  async removeDuplicates() {
    // Duplicates have the same languageId, masterId and lessonStringId
    console.log("Removing duplicates...");
    let duplicates = 0;
    const languages = await this.languages();
    for (let langIndex = 0; langIndex < languages.length; ++langIndex) {
      const language = languages[langIndex];
      const tStrings = await this.tStrings({ languageId: language.languageId });
      for (let i = 0; i < tStrings.length; ++i) {
        for (let j = 0; j < i; ++j) {
          if (equal(tStrings[i], tStrings[j])) {
            ++duplicates;
            console.log(`Duplicate ${language.name} ${tStrings[i].masterId}`);
            const tString = tStrings[i];
            if (tString.lessonStringId)
              await this
                .sql`DELETE FROM tstrings WHERE languageId=${tString.languageId} AND masterId=${tString.masterId} AND lessonStringId=${tString.lessonStringId}`;
            else
              await this
                .sql`DELETE FROM tstrings WHERE languageId=${tString.languageId} AND masterId=${tString.masterId} AND lessonStringId IS NULL`;
            await this.sql`INSERT INTO tStrings ${this.sql(
              sqlizeTString(tString)
            )}`;
          }
        }
      }
    }
    console.log(`${duplicates} duplicates removed.`);
    console.log("...done");
  }

  async consolidateEnglish() {
    // Find tStrings with the same text
    console.log("Consolidating English...");
    const englishStrings = await this.tStrings({ languageId: ENGLISH_ID });
    for (let i = 0; i < englishStrings.length; ++i) {
      for (let j = 0; j < i; ++j) {
        if (englishStrings[i].text == englishStrings[j].text) {
          console.log(
            `Consolidate ${englishStrings[i].masterId} with ${englishStrings[j].masterId}: ${englishStrings[i].text} `
          );
          await this
            .sql`UPDATE lessonstrings SET masterid=${englishStrings[j].masterId} WHERE masterid=${englishStrings[i].masterId}`;
          await this
            .sql`DELETE FROM tstrings WHERE masterid=${englishStrings[i].masterId}`;
        }
      }
    }
    console.log("...done");
  }
}

new PGStorageCleaner().cleanDB();
