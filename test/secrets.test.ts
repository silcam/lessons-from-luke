import secrets from "../src/util/secrets";

test("secrets", () => {
  expect(secrets.cookieSecret.length).toBeGreaterThan(0);
  expect(secrets.adminUsername.length).toBeGreaterThan(0);
  expect(secrets.adminPassword.length).toBeGreaterThan(0);
});
