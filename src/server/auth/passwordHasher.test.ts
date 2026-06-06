import { hash, verify } from "./passwordHasher";

describe("passwordHasher", () => {
  const password = "correct-horse-battery-staple";
  const wrongPassword = "wrong-password";

  it("hash(password) returns a string matching the argon2id format", async () => {
    const result = await hash(password);
    expect(result).toMatch(
      /^argon2id\$[0-9]+\$[0-9]+\$[0-9]+\$[0-9a-f]+\$[0-9a-f]+$/
    );
  });

  it("hash(password) produces different values on repeated calls (salt randomness)", async () => {
    const hash1 = await hash(password);
    const hash2 = await hash(password);
    expect(hash1).not.toBe(hash2);
  });

  it("verify(hash(password), password) returns true (round-trip)", async () => {
    const hashed = await hash(password);
    const result = await verify(hashed, password);
    expect(result).toBe(true);
  });

  it("verify(hash(password), wrongPassword) returns false", async () => {
    const hashed = await hash(password);
    const result = await verify(hashed, wrongPassword);
    expect(result).toBe(false);
  });

  it("verify('not-a-valid-hash', password) returns false without throwing", async () => {
    const result = await verify("not-a-valid-hash", password);
    expect(result).toBe(false);
  });
});
