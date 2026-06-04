import request from "supertest";
import http from "http";
import serverApp from "./serverApp";
import secrets from "./util/secrets";

export { USE_PG } from "./testConfig";

const app = serverApp({ silent: true, storage: (global as any).testStorage });

// One long-lived http.Server for the whole worker. If we hand supertest the
// raw Express app, it spins up and tears down a fresh server per request —
// thousands of listen/close cycles per run, which produces intermittent
// "socket hang up" failures on Node 24. A single already-listening server
// makes supertest skip the lifecycle entirely.
const server = http.createServer(app);
server.listen(0);
server.unref();

export async function loggedInAgent() {
  const agent = request.agent(server);
  await agent
    .post("/api/users/login")
    .send({ username: secrets.adminUsername, password: secrets.adminPassword });
  return agent;
}

export function plainAgent() {
  return request.agent(server);
}

export function stripSpace(text: string) {
  return text.replace(/\s/g, "");
}

export async function resetStorage() {
  return plainAgent().post("/api/test/reset-storage");
}

export async function closeStorage() {
  // Storage lifecycle is managed by jestSetupAfterEnv.ts
}
