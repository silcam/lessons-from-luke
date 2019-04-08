import request from "supertest";
import app from "../src/app";
import secrets from "../src/util/secrets";
import fs from "fs";

export async function loggedInAgent() {
  const agent = request.agent(app);
  await agent
    .post("/login")
    .type("form")
    .send({ username: secrets.adminUsername, password: secrets.adminPassword })
    .redirects(1);
  return agent;
}

function unlinkRecursive(path: string) {
  if (fs.existsSync(path)) {
    if (fs.statSync(path).isDirectory()) {
      fs.readdirSync(path).forEach(filename => {
        unlinkRecursive(`${path}/${filename}`);
      });
      fs.rmdirSync(path);
    } else {
      fs.unlinkSync(path);
    }
  }
}

function copyRecursive(from: string, to: string) {
  fs.copyFileSync(from, to);
  if (fs.statSync(from).isDirectory()) {
    fs.readdirSync(from).forEach(filename => {
      copyRecursive(`${from}/${filename}`, `${to}/${filename}`);
    });
  }
}

export function resetTestStorage() {
  unlinkRecursive("test/strings");
  copyRecursive("test/base-strings", "test/strings");
}
