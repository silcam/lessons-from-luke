/// <reference types="jest" />

import request from "supertest";
import serverApp from "./serverApp";

test("serverApp logging middleware fires when silent is false", async () => {
  const spy = jest.spyOn(console, "log").mockImplementation(() => {});
  const app = serverApp({ silent: false });
  const response = await request(app).get("/api/languages");
  // Give the finish event a tick to fire
  await new Promise(resolve => setTimeout(resolve, 50));
  expect(response.status).toBe(200);
  expect(spy).toHaveBeenCalled();
  spy.mockRestore();
});
