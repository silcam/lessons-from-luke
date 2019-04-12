import request from "supertest";
import app from "../src/app";
import secrets from "../src/util/secrets";
import fs from "fs";
import { copyRecursive, unlinkRecursive } from "../src/util/fsUtils";

export async function loggedInAgent() {
  const agent = request.agent(app);
  await agent
    .post("/login")
    .type("form")
    .send({ username: secrets.adminUsername, password: secrets.adminPassword })
    .redirects(1);
  return agent;
}

export function resetTestStorage() {
  unlinkRecursive("test/strings");
  copyRecursive("test/base-strings", "test/strings");
}

export function stripSpace(text: string) {
  return text.replace(/\s/g, "");
}
