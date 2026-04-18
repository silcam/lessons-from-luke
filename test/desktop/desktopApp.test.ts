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
    args: [path.join(__dirname, "../../dist/desktop/main-test.js")],
    env: { ...process.env, FIXTURES: "fresh-install" }
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

test("Login guard: translation UI is inaccessible before entering a project code", async () => {
  const app = await electron.launch({
    args: [path.join(__dirname, "../../dist/desktop/main-test.js")],
    env: { ...process.env, FIXTURES: "fresh-install" }
  });
  const window = await app.firstWindow();

  // App must reach the online/code-entry state before we can assert anything
  await window.locator('h1:text("Online")').waitFor();

  // The code-entry text input should be visible
  await window.locator("input[type='text']").waitFor();

  // The "Start Translating" button must not exist — no translation UI yet
  const startBtn = window.locator('button:text("Start Translating")');
  expect(await startBtn.count()).toBe(0);

  await app.close();
}, 10000);

test("Translation workflow: type and save a translation string", async () => {
  const app = await electron.launch({
    args: [path.join(__dirname, "../../dist/desktop/main-test.js")],
    env: { ...process.env, FIXTURES: "fresh-install" }
  });
  const window = await app.firstWindow();

  // Complete downsync
  await window.locator('h1:text("Online")').waitFor();
  await window.click("input[type='text']");
  await window.keyboard.type("GHI");
  await window.click("button:text('OK')");
  await window.locator('button:text("Start Translating")').waitFor();
  await window.click('button:text("Start Translating")');

  // Wait for the translation UI to load (a lesson string becomes visible)
  await window
    .locator('p:text("The Book of Luke and the Birth of John the Baptizer")')
    .waitFor();

  // Find the first translation textarea (placeholder = language name "Batanga")
  const textarea = window.locator('textarea[placeholder="Batanga"]').first();
  await textarea.waitFor();

  // Type a translation and blur to trigger the auto-save
  await textarea.click();
  await textarea.fill("Test translation");
  // Blur the textarea to trigger onBlur → save
  await textarea.press("Tab");

  // Header should reflect saved or uploading state
  await window
    .locator('h1:text("Changes Saved"), h1:text("Uploading")')
    .waitFor({ timeout: 5000 });

  await app.close();
}, 20000);
