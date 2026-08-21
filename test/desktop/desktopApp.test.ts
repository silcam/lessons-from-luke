/// <reference types="jest" />
import { _electron as electron } from "playwright";
import Axios from "axios";
import path from "path";

// Headless-test flags appended to every electron.launch:
// - --no-sandbox: Chromium's setuid sandbox is unavailable on Ubuntu CI runners
//   without privileged userns (we already toggle the apparmor restriction in
//   the desktop-e2e workflow, but --no-sandbox is the belt-and-suspenders fix
//   that doesn't rely on the runner's kernel config).
// - --disable-gpu / --disable-software-rasterizer: under Xvfb there is no real
//   GPU; Chromium spends seconds negotiating GPU initialization before falling
//   back to software rendering, which was pushing the Downsync and Translation
//   tests past their 15-20s timeouts in CI.
const ELECTRON_TEST_ARGS = ["--no-sandbox", "--disable-gpu", "--disable-software-rasterizer"];

beforeAll(async () => {
  try {
    // Readiness probe: /api/languages is public and DB-backed, so a 200 confirms
    // the API process is up AND can reach Postgres. (The legacy /api/users/current
    // endpoint this used to hit was removed in the better-auth migration.)
    await Axios.get("http://localhost:8081/api/languages");
    await Axios.get("http://localhost:8082/desktop.html", {});
    // Seed the test API's database from fixtures so the GHI project / Batanga
    // language exist. Without this, a freshly-migrated CI database has only
    // schema, the downsync request for "GHI" returns nothing, and every test
    // times out waiting for the "Syncing Batanga project..." screen. (Locally
    // this worked by accident because the test DB carried over fixtures from
    // the previous jest run.)
    await Axios.post("http://localhost:8081/api/test/reset-storage");
  } catch (err) {
    console.error(
      "Please ensure that the Server App is running on port 8081 and webpack for desktop on port 8082. (Try starting yarn test-desktop-e2e-deps.)"
    );
    throw err;
  }
});

test("Downsync", async () => {
  const app = await electron.launch({
    args: [path.join(__dirname, "../../dist/desktop/main-test.js"), ...ELECTRON_TEST_ARGS],
    env: { ...process.env, FIXTURES: "fresh-install" },
  });
  const window = await app.firstWindow();

  await window.locator('h1:text("Online")').waitFor();
  await window.click("input[type='text']");
  await window.keyboard.type("GHI");
  await window.click("button:text('OK')");
  // The syncing screen is transient — on a fast sync it can disappear before
  // this locator attaches, so accept either it or the completed state.
  await window
    .locator('h1:text("Syncing Batanga project..."), button:text("Start Translating")')
    .waitFor();

  await window.locator('button:text("Start Translating")').waitFor();
  await window.click('button:text("Start Translating")');
  await window.locator('p:text("The Book of Luke and the Birth of John the Baptizer")').waitFor();

  await app.close();
}, 15000);

test("Login guard: translation UI is inaccessible before entering a project code", async () => {
  const app = await electron.launch({
    args: [path.join(__dirname, "../../dist/desktop/main-test.js"), ...ELECTRON_TEST_ARGS],
    env: { ...process.env, FIXTURES: "fresh-install" },
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
    args: [path.join(__dirname, "../../dist/desktop/main-test.js"), ...ELECTRON_TEST_ARGS],
    env: { ...process.env, FIXTURES: "fresh-install" },
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
  await window.locator('p:text("The Book of Luke and the Birth of John the Baptizer")').waitFor();

  // Find the first translation textarea (placeholder = language name "Batanga")
  const textarea = window.locator('textarea[placeholder="Batanga"]').first();
  await textarea.waitFor();

  // Type a translation and blur to trigger the auto-save
  await textarea.click();
  await textarea.fill("Test translation");
  // Blur the textarea to trigger onBlur → save
  await textarea.press("Tab");

  // Header should reflect saved or uploading state
  await window.locator('h1:text("Changes Saved"), h1:text("Uploading")').waitFor({ timeout: 5000 });

  await app.close();
}, 20000);
