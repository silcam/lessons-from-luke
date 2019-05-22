import fs from "fs";
import { DocString } from "../xml/parse";
import { TDocString } from "../util/Storage";

addMTStringProp();

function addMTStringProp() {
  if (fs.existsSync("./src")) {
    const langs = fs.readdirSync("./src");
    for (let i = 0; i < langs.length; ++i) {
      const langDirPath = `./src/${langs[i]}`;
      const docs = fs.readdirSync(langDirPath);
      for (let j = 0; j < docs.length; ++j) {
        const stringsJSONPath = `${langDirPath}/${docs[j]}/strings.json`;
        const strings = JSON.parse(
          fs.readFileSync(stringsJSONPath).toString()
        ) as DocString[];
        if (!strings.some(str => !!str.mtString)) {
          const updatedStrings = strings.map(str => ({
            ...str,
            mtString: true
          }));
          fs.writeFileSync(stringsJSONPath, JSON.stringify(updatedStrings));
        }
      }
    }
  }

  if (fs.existsSync("./translations")) {
    const projects = fs.readdirSync("./translations");
    for (let i = 0; i < projects.length; ++i) {
      const projectDirPath = `./translations/${projects[i]}`;
      const lessons = fs.readdirSync(projectDirPath);
      for (let j = 0; j < lessons.length; ++j) {
        const jsonPath = `${projectDirPath}/${lessons[j]}`;
        const strings = JSON.parse(
          fs.readFileSync(jsonPath).toString()
        ) as TDocString[];
        if (!strings.some(str => !!str.mtString)) {
          const updatedStrings = strings.map(str => ({
            ...str,
            mtString: true
          }));
          fs.writeFileSync(jsonPath, JSON.stringify(updatedStrings));
        }
      }
    }
  }
}
