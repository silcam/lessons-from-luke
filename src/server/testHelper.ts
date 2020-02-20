import request from "supertest";
import serverApp from "./serverApp";
import secrets from "./util/secrets";

const app = serverApp({ silent: true, testController: true });

export async function loggedInAgent() {
  const agent = request.agent(app);
  await agent
    .post("/api/users/login")
    .send({ username: secrets.adminUsername, password: secrets.adminPassword });
  return agent;
}

export function plainAgent() {
  return request.agent(app);
}

export function stripSpace(text: string) {
  return text.replace(/\s/g, "");
}

export async function resetStorage() {
  return plainAgent().post("/api/test/reset-storage");
}
