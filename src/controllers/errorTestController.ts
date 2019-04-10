import { Express } from "express";
import fs from "fs";

export default function errorTestController(app: Express) {
  app.get("/syncError", (req, res) => {
    // JSON.parse(fs.readFileSync("NoSuchFile").toString());
    throw "Test Error";
  });

  app.get("/asyncError", async (req, res, next) => {
    try {
      const sourcesStr = await readFile("./strings/sources.json");
      // const crash = JSON.parse(sourcesStr).not.a.real.property;
      throw "Test Error";
    } catch (err) {
      next(err);
    }
  });
}

async function readFile(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    fs.readFile(path, (err, data) => {
      if (err) reject(err);
      else resolve(data.toString());
    });
  });
} //
