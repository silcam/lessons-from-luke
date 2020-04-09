/// <reference types="jest" />
import { Application } from "spectron";
import Axios from "axios";
const electronPath: unknown = require("electron"); // Path to electron from the spectron README

beforeAll(async () => {
  try {
    let response = await Axios.get("http://localhost:8081/api/users/current");
    response = await Axios.get("http://localhost:8082/desktop.html", {});
  } catch (err) {
    console.error(
      "Please ensure that the Server App is running on port 8081 and webpack for desktop on port 8082. (Try starting yarn test-spectron-deps.)"
    );
    throw err;
  }
});

test("Downsync", async () => {
  const app = new Application({
    path: electronPath as string,
    args: ["dist/desktop/main-test.js"]
  });
  await app.start();

  await app.client.click("input[type='text']");
  await app.client.keys("GHI");
  await app.client.click("button=OK");
  expect(
    await app.client.waitForVisible("h1=Downloading Batanga project...")
  ).toBe(true);

  await app.client.waitForVisible("button=Start Translating");
  await app.client.click("button=Start Translating");
  expect(
    await app.client.waitForVisible(
      "p=The Book of Luke and the Birth of John the Baptizer"
    )
  ).toBe(true);

  await app.stop();
}, 15000);

async function printLogs(app: Application) {
  const logs = await app.client.getMainProcessLogs();
  logs.forEach(log => console.log(`MAIN: ${log}`));
}
