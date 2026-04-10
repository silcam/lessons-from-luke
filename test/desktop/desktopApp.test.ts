/// <reference types="jest" />
import { _electron as electron } from "playwright";
import Axios from "axios";
import path from "path";

beforeAll(async () => {
  try {
    await Axios.get("http://localhost:8081/api/users/current");
    await Axios.get("http://localhost:8082/desktop.html", {});
  } catch (err) {
    console.error(
      "Please ensure that the Server App is running on port 8081 and webpack for desktop on port 8082. (Try starting yarn test-desktop-e2e-deps.)"
    );
    throw err;
  }
});

test("Downsync", async () => {
  const app = await electron.launch({
    args: [path.join(__dirname, "../../dist/desktop/desktop/main-test.js")]
  });
  const window = await app.firstWindow();

  await window.locator('h1:text("Online")').waitFor();
  await window.click("input[type='text']");
  await window.keyboard.type("GHI");
  await window.click("button:text('OK')");
  await window.locator('h1:text("Syncing Batanga project...")').waitFor();

  await window.locator('button:text("Start Translating")').waitFor();
  await window.click('button:text("Start Translating")');
  await window
    .locator('p:text("The Book of Luke and the Birth of John the Baptizer")')
    .waitFor();

  await app.close();
}, 15000);
