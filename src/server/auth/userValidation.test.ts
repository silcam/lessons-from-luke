import {
  UserNotFoundError,
  LastAdminError,
  SelfDeactivationError,
  InvalidRoleError,
  parseAccountRole,
  type AccountRole,
  type AccountStatus,
} from "./userValidation";

describe("userValidation", () => {
  // ------------------------------------------------------------------ UserNotFoundError

  describe("UserNotFoundError", () => {
    it("is an instance of Error with code USER_NOT_FOUND", () => {
      const err = new UserNotFoundError("user-123");
      expect(err).toBeInstanceOf(Error);
      expect(err.code).toBe("USER_NOT_FOUND");
    });

    it("has a clear, non-empty message referencing the account id", () => {
      const err = new UserNotFoundError("user-123");
      expect(typeof err.message).toBe("string");
      expect(err.message.length).toBeGreaterThan(0);
      expect(err.message).toMatch(/user-123/);
    });
  });

  // ------------------------------------------------------------------ LastAdminError

  describe("LastAdminError", () => {
    it("is an instance of Error with code LAST_ADMIN", () => {
      const err = new LastAdminError();
      expect(err).toBeInstanceOf(Error);
      expect(err.code).toBe("LAST_ADMIN");
    });

    it("has a clear, non-empty message explaining the refusal", () => {
      const err = new LastAdminError();
      expect(typeof err.message).toBe("string");
      expect(err.message.length).toBeGreaterThan(0);
      expect(err.message).toMatch(/admin/i);
    });

    it("is usable to refuse both a demote and a deactivate of the last admin", () => {
      // Same error class covers both call sites per data-model.md — no
      // action-specific state, just a generic refusal.
      const demoteRefusal = new LastAdminError();
      const deactivateRefusal = new LastAdminError();
      expect(demoteRefusal.code).toBe("LAST_ADMIN");
      expect(deactivateRefusal.code).toBe("LAST_ADMIN");
    });
  });

  // ------------------------------------------------------------------ SelfDeactivationError

  describe("SelfDeactivationError", () => {
    it("is an instance of Error with code SELF_DEACTIVATION", () => {
      const err = new SelfDeactivationError();
      expect(err).toBeInstanceOf(Error);
      expect(err.code).toBe("SELF_DEACTIVATION");
    });

    it("has a clear, non-empty message", () => {
      const err = new SelfDeactivationError();
      expect(typeof err.message).toBe("string");
      expect(err.message.length).toBeGreaterThan(0);
    });
  });

  // ------------------------------------------------------------------ InvalidRoleError

  describe("InvalidRoleError", () => {
    it("is an instance of Error with code INVALID_ROLE", () => {
      const err = new InvalidRoleError("owner");
      expect(err).toBeInstanceOf(Error);
      expect(err.code).toBe("INVALID_ROLE");
    });

    it("has a clear, non-empty message referencing the invalid value", () => {
      const err = new InvalidRoleError("owner");
      expect(typeof err.message).toBe("string");
      expect(err.message.length).toBeGreaterThan(0);
      expect(err.message).toMatch(/owner/);
    });
  });

  // ------------------------------------------------------------------ parseAccountRole

  describe("parseAccountRole(value)", () => {
    it("returns 'admin' unchanged", () => {
      expect(parseAccountRole("admin")).toBe("admin");
    });

    it("returns 'standard' unchanged", () => {
      expect(parseAccountRole("standard")).toBe("standard");
    });

    it("throws InvalidRoleError for any other string", () => {
      expect(() => parseAccountRole("owner")).toThrow(InvalidRoleError);
    });

    it("throws InvalidRoleError for non-string values (malformed request body)", () => {
      expect(() => parseAccountRole(undefined)).toThrow(InvalidRoleError);
      expect(() => parseAccountRole(null)).toThrow(InvalidRoleError);
      expect(() => parseAccountRole(42)).toThrow(InvalidRoleError);
      expect(() => parseAccountRole({})).toThrow(InvalidRoleError);
      expect(() => parseAccountRole(["admin"])).toThrow(InvalidRoleError);
    });

    it("the thrown error carries the INVALID_ROLE code", () => {
      let caught: unknown;
      try {
        parseAccountRole("owner");
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(InvalidRoleError);
      expect((caught as InvalidRoleError).code).toBe("INVALID_ROLE");
    });
  });

  // ------------------------------------------------------------------ AccountRole / AccountStatus (type-level)

  describe("AccountRole / AccountStatus", () => {
    it("AccountRole accepts the literal strings 'admin' and 'standard'", () => {
      const admin: AccountRole = "admin";
      const standard: AccountRole = "standard";
      expect(admin).toBe("admin");
      expect(standard).toBe("standard");
    });

    it("AccountStatus accepts the literal strings 'active' and 'deactivated'", () => {
      const active: AccountStatus = "active";
      const deactivated: AccountStatus = "deactivated";
      expect(active).toBe("active");
      expect(deactivated).toBe("deactivated");
    });
  });
});
