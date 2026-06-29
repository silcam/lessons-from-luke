/// <reference types="jest" />
import { _electron as electron } from "playwright";
import Axios from "axios";
import path from "path";
import secrets from "../../src/server/util/secrets";

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

const API_BASE = "http://localhost:8081";
const MAIN = path.join(__dirname, "../../dist/desktop/main-test.js");
const adminEmail = (secrets.adminEmail ?? "admin@example.com").toLowerCase();
const adminPassword = secrets.adminPassword;

// A real better-auth session token, obtained by signing in as the seeded admin.
// Since 004 the desktop gates the sync/translate UI behind device pairing
// (FR-015): an online-but-unpaired device shows a "connect to account" prompt,
// not the code-entry form. The real device handshake is approved in the
// browser, which this Electron-only e2e cannot drive, so the paired tests inject
// this token via DESKTOP_E2E_TOKEN to start the app already paired. The unpaired
// gate itself is asserted by the "Login guard" test below; the handshake logic
// is unit-tested in src/desktop/DesktopApp.test.ts.
let desktopToken: string;

beforeAll(async () => {
  try {
    // Readiness probe: /api/languages is public and DB-backed, so a 200 confirms
    // the API process is up AND can reach Postgres. (The legacy /api/users/current
    // endpoint this used to hit was removed in the better-auth migration.)
    await Axios.get(`${API_BASE}/api/languages`);
    await Axios.get("http://localhost:8082/desktop.html", {});
    // Seed the test API's database from fixtures so the GHI project / Batanga
    // language exist. Without this, a freshly-migrated CI database has only
    // schema, the downsync request for "GHI" returns nothing, and every test
    // times out waiting for the "Syncing Batanga project..." screen. (Locally
    // this worked by accident because the test DB carried over fixtures from
    // the previous jest run.)
    await Axios.post(`${API_BASE}/api/test/reset-storage`);
  } catch (err) {
    console.error(
      "Please ensure that the Server App is running on port 8081 and webpack for desktop on port 8082. (Try starting yarn test-desktop-e2e-deps.)"
    );
    throw err;
  }

  // Sign in as the migrate:test-seeded admin and capture the bearer session
  // token from better-auth's `set-auth-token` response header (bearer plugin).
  // The desktop sends this as `Authorization: Bearer <token>` and getSession
  // accepts it identically to a token earned through the device flow.
  const signIn = await Axios.post(`${API_BASE}/api/auth/sign-in/email`, {
    email: adminEmail,
    password: adminPassword,
  });
  const token = signIn.headers["set-auth-token"];
  if (!token) {
    throw new Error("Admin sign-in did not return a set-auth-token header (bearer plugin).");
  }
  desktopToken = token;
});

// The e2e harness runs the API on :8081 and the desktop webpack dev server on
// :8082 — there is no :8080 web dev server (which interactive dev-desktop relies
// on for the pairing verification_uri). DESKTOP_E2E_BASE_URL points the app's
// API base directly at the running API server so sync/online calls succeed.
const DESKTOP_E2E_BASE_URL = API_BASE;

// Launch the desktop already paired (post-pairing flow: code entry → sync → translate).
function launchPaired() {
  return electron.launch({
    args: [MAIN, ...ELECTRON_TEST_ARGS],
    env: {
      ...process.env,
      FIXTURES: "fresh-install",
      DESKTOP_E2E_TOKEN: desktopToken,
      DESKTOP_E2E_BASE_URL,
    },
  });
}

// Launch the desktop unpaired (no credential), as a fresh field install would be.
function launchUnpaired() {
  return electron.launch({
    args: [MAIN, ...ELECTRON_TEST_ARGS],
    env: { ...process.env, FIXTURES: "fresh-install", DESKTOP_E2E_BASE_URL },
  });
}

test("Downsync", async () => {
  const app = await launchPaired();
  const window = await app.firstWindow();

  await window.locator('h1:text("Online")').waitFor();
  await window.click("input[type='text']");
  await window.keyboard.type("GHI");
  await window.click("button:text('OK')");
  await window.locator('h1:text("Syncing Batanga project...")').waitFor();

  await window.locator('button:text("Start Translating")').waitFor();
  await window.click('button:text("Start Translating")');
  await window.locator('p:text("The Book of Luke and the Birth of John the Baptizer")').waitFor();

  await app.close();
}, 15000);

test("Login guard: translation UI is inaccessible before pairing", async () => {
  // Unpaired (no DESKTOP_E2E_TOKEN): per spec FR-015 an online-but-unpaired
  // device must surface a clear "connect" prompt rather than the code-entry
  // form or any path into the translation UI.
  const app = await launchUnpaired();
  const window = await app.firstWindow();

  // App must reach the online state before the pairing gate is shown.
  await window.locator('h1:text("Online")').waitFor();

  // The connect prompt is the only actionable control — its presence confirms
  // we are on the gate screen (which replaces the code-entry form).
  await window.locator('button:text("Connect to account")').waitFor();

  // No code-entry form, and no way to start translating, before pairing.
  expect(await window.locator("input[type='text']").count()).toBe(0);
  expect(await window.locator('button:text("Start Translating")').count()).toBe(0);

  await app.close();
}, 15000);

test("Translation workflow: type and save a translation string", async () => {
  const app = await launchPaired();
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
