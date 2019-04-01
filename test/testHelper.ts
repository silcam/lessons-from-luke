import request from "supertest";
import app from "../src/app";
import secrets from "../src/util/secrets";

export async function loggedInAgent() {
  const agent = request.agent(app);
  await agent
    .post("/login")
    .type("form")
    .send({ username: secrets.adminUsername, password: secrets.adminPassword })
    .redirects(1);
  return agent;
}
