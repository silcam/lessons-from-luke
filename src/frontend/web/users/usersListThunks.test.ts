/**
 * usersListThunks.test.ts — unit tests for the admin user roster Redux thunk
 *
 * Stubs global fetch; asserts correct request construction and response mapping.
 */

import {
  listUsers,
  deactivateAccount,
  reactivateAccount,
  changeRole,
  revokeSessions,
} from "./usersListThunks";

const mockFetch = jest.fn();
global.fetch = mockFetch;

describe("usersListThunks", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const sampleRow = {
    id: "user-1",
    email: "user@example.com",
    name: "Test User",
    role: "standard",
    status: "active",
    createdAt: "2026-06-01T00:00:00.000Z",
    isSelf: false,
  };

  describe("listUsers", () => {
    it("GETs /api/admin/users", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [sampleRow],
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await listUsers()(dispatch, getState, undefined);

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/admin/users",
        expect.objectContaining({ method: "GET" })
      );
    });

    it("on success, dispatches fulfilled with array of user rows", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [sampleRow],
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await listUsers()(dispatch, getState, undefined);

      const fulfilledCall = dispatch.mock.calls.find(
        ([action]) => action.type === "usersList/listUsers/fulfilled"
      );
      expect(fulfilledCall).toBeTruthy();
      expect(fulfilledCall![0].payload).toEqual([sampleRow]);
    });

    it("on network failure, rejects with { code: 'network_error' }", async () => {
      mockFetch.mockRejectedValue(new Error("Network failure"));

      const dispatch = jest.fn();
      const getState = jest.fn();

      await listUsers()(dispatch, getState, undefined);

      const rejectedCall = dispatch.mock.calls.find(
        ([action]) => action.type === "usersList/listUsers/rejected"
      );
      expect(rejectedCall).toBeTruthy();
      expect(rejectedCall![0].payload).toMatchObject({ code: "network_error" });
    });

    it("on non-ok response, rejects with { code: 'unknown_error' }", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: "boom" }),
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await listUsers()(dispatch, getState, undefined);

      const rejectedCall = dispatch.mock.calls.find(
        ([action]) => action.type === "usersList/listUsers/rejected"
      );
      expect(rejectedCall).toBeTruthy();
      expect(rejectedCall![0].payload).toMatchObject({ code: "unknown_error" });
    });
  });

  describe("deactivateAccount", () => {
    it("POSTs to /api/admin/users/:id/deactivate", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ ...sampleRow, status: "deactivated" }),
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await deactivateAccount("user-1")(dispatch, getState, undefined);

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/admin/users/user-1/deactivate",
        expect.objectContaining({ method: "POST" })
      );
    });

    it("on success, dispatches fulfilled with the updated row", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ ...sampleRow, status: "deactivated" }),
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await deactivateAccount("user-1")(dispatch, getState, undefined);

      const fulfilledCall = dispatch.mock.calls.find(
        ([action]) => action.type === "usersList/deactivateAccount/fulfilled"
      );
      expect(fulfilledCall).toBeTruthy();
      expect(fulfilledCall![0].payload).toMatchObject({ status: "deactivated" });
    });

    it("on 404, rejects with { code: 'not_found' }", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ error: "User not found", code: "USER_NOT_FOUND" }),
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await deactivateAccount("user-missing")(dispatch, getState, undefined);

      const rejectedCall = dispatch.mock.calls.find(
        ([action]) => action.type === "usersList/deactivateAccount/rejected"
      );
      expect(rejectedCall).toBeTruthy();
      expect(rejectedCall![0].payload).toMatchObject({ code: "not_found" });
    });

    it("on 404 with no error message in the body, falls back to the default message", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ code: "USER_NOT_FOUND" }),
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await deactivateAccount("user-missing")(dispatch, getState, undefined);

      const rejectedCall = dispatch.mock.calls.find(
        ([action]) => action.type === "usersList/deactivateAccount/rejected"
      );
      expect(rejectedCall).toBeTruthy();
      expect(rejectedCall![0].payload).toMatchObject({
        code: "not_found",
        message: "User not found",
      });
    });

    it("on 409 LAST_ADMIN, rejects with { code: 'last_admin' }", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({
          error: "Cannot remove the last active admin account",
          code: "LAST_ADMIN",
        }),
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await deactivateAccount("user-1")(dispatch, getState, undefined);

      const rejectedCall = dispatch.mock.calls.find(
        ([action]) => action.type === "usersList/deactivateAccount/rejected"
      );
      expect(rejectedCall).toBeTruthy();
      expect(rejectedCall![0].payload).toMatchObject({ code: "last_admin" });
    });

    it("on 409 LAST_ADMIN with no error message in the body, falls back to the default message", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ code: "LAST_ADMIN" }),
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await deactivateAccount("user-1")(dispatch, getState, undefined);

      const rejectedCall = dispatch.mock.calls.find(
        ([action]) => action.type === "usersList/deactivateAccount/rejected"
      );
      expect(rejectedCall).toBeTruthy();
      expect(rejectedCall![0].payload).toMatchObject({
        code: "last_admin",
        message: "Cannot remove the last active admin account",
      });
    });

    it("on 409 SELF_DEACTIVATION, rejects with { code: 'self_deactivation' }", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({
          error: "You cannot deactivate your own account",
          code: "SELF_DEACTIVATION",
        }),
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await deactivateAccount("admin1")(dispatch, getState, undefined);

      const rejectedCall = dispatch.mock.calls.find(
        ([action]) => action.type === "usersList/deactivateAccount/rejected"
      );
      expect(rejectedCall).toBeTruthy();
      expect(rejectedCall![0].payload).toMatchObject({ code: "self_deactivation" });
    });

    it("on 409 SELF_DEACTIVATION with no error message in the body, falls back to the default message", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ code: "SELF_DEACTIVATION" }),
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await deactivateAccount("admin1")(dispatch, getState, undefined);

      const rejectedCall = dispatch.mock.calls.find(
        ([action]) => action.type === "usersList/deactivateAccount/rejected"
      );
      expect(rejectedCall).toBeTruthy();
      expect(rejectedCall![0].payload).toMatchObject({
        code: "self_deactivation",
        message: "You cannot deactivate your own account",
      });
    });

    it("on network failure, rejects with { code: 'network_error' }", async () => {
      mockFetch.mockRejectedValue(new Error("Network failure"));

      const dispatch = jest.fn();
      const getState = jest.fn();

      await deactivateAccount("user-1")(dispatch, getState, undefined);

      const rejectedCall = dispatch.mock.calls.find(
        ([action]) => action.type === "usersList/deactivateAccount/rejected"
      );
      expect(rejectedCall).toBeTruthy();
      expect(rejectedCall![0].payload).toMatchObject({ code: "network_error" });
    });

    it("on non-ok, non-404/409 response, rejects with { code: 'unknown_error' }", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: "boom" }),
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await deactivateAccount("user-1")(dispatch, getState, undefined);

      const rejectedCall = dispatch.mock.calls.find(
        ([action]) => action.type === "usersList/deactivateAccount/rejected"
      );
      expect(rejectedCall).toBeTruthy();
      expect(rejectedCall![0].payload).toMatchObject({ code: "unknown_error" });
    });

    it("on non-ok, non-404/409 response with no error message in the body, falls back to the default message", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({}),
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await deactivateAccount("user-1")(dispatch, getState, undefined);

      const rejectedCall = dispatch.mock.calls.find(
        ([action]) => action.type === "usersList/deactivateAccount/rejected"
      );
      expect(rejectedCall).toBeTruthy();
      expect(rejectedCall![0].payload).toMatchObject({
        code: "unknown_error",
        message: "Unknown error",
      });
    });
  });

  describe("reactivateAccount", () => {
    it("POSTs to /api/admin/users/:id/reactivate", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ ...sampleRow, status: "active" }),
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await reactivateAccount("user-1")(dispatch, getState, undefined);

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/admin/users/user-1/reactivate",
        expect.objectContaining({ method: "POST" })
      );
    });

    it("on success, dispatches fulfilled with the updated row", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ ...sampleRow, status: "active" }),
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await reactivateAccount("user-1")(dispatch, getState, undefined);

      const fulfilledCall = dispatch.mock.calls.find(
        ([action]) => action.type === "usersList/reactivateAccount/fulfilled"
      );
      expect(fulfilledCall).toBeTruthy();
      expect(fulfilledCall![0].payload).toMatchObject({ status: "active" });
    });

    it("on 404, rejects with { code: 'not_found' }", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ error: "User not found", code: "USER_NOT_FOUND" }),
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await reactivateAccount("user-missing")(dispatch, getState, undefined);

      const rejectedCall = dispatch.mock.calls.find(
        ([action]) => action.type === "usersList/reactivateAccount/rejected"
      );
      expect(rejectedCall).toBeTruthy();
      expect(rejectedCall![0].payload).toMatchObject({ code: "not_found" });
    });

    it("on 404 with no error message in the body, falls back to the default message", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ code: "USER_NOT_FOUND" }),
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await reactivateAccount("user-missing")(dispatch, getState, undefined);

      const rejectedCall = dispatch.mock.calls.find(
        ([action]) => action.type === "usersList/reactivateAccount/rejected"
      );
      expect(rejectedCall).toBeTruthy();
      expect(rejectedCall![0].payload).toMatchObject({
        code: "not_found",
        message: "User not found",
      });
    });

    it("on network failure, rejects with { code: 'network_error' }", async () => {
      mockFetch.mockRejectedValue(new Error("Network failure"));

      const dispatch = jest.fn();
      const getState = jest.fn();

      await reactivateAccount("user-1")(dispatch, getState, undefined);

      const rejectedCall = dispatch.mock.calls.find(
        ([action]) => action.type === "usersList/reactivateAccount/rejected"
      );
      expect(rejectedCall).toBeTruthy();
      expect(rejectedCall![0].payload).toMatchObject({ code: "network_error" });
    });

    it("on non-ok, non-404 response, rejects with { code: 'unknown_error' }", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: "boom" }),
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await reactivateAccount("user-1")(dispatch, getState, undefined);

      const rejectedCall = dispatch.mock.calls.find(
        ([action]) => action.type === "usersList/reactivateAccount/rejected"
      );
      expect(rejectedCall).toBeTruthy();
      expect(rejectedCall![0].payload).toMatchObject({ code: "unknown_error" });
    });

    it("on non-ok, non-404 response with no error message in the body, falls back to the default message", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({}),
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await reactivateAccount("user-1")(dispatch, getState, undefined);

      const rejectedCall = dispatch.mock.calls.find(
        ([action]) => action.type === "usersList/reactivateAccount/rejected"
      );
      expect(rejectedCall).toBeTruthy();
      expect(rejectedCall![0].payload).toMatchObject({
        code: "unknown_error",
        message: "Unknown error",
      });
    });
  });

  describe("changeRole", () => {
    it("POSTs to /api/admin/users/:id/role with the requested role", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ ...sampleRow, role: "admin" }),
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await changeRole({ id: "user-1", role: "admin" })(dispatch, getState, undefined);

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/admin/users/user-1/role",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: "admin" }),
        })
      );
    });

    it("on success, dispatches fulfilled with the updated row", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ ...sampleRow, role: "admin" }),
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await changeRole({ id: "user-1", role: "admin" })(dispatch, getState, undefined);

      const fulfilledCall = dispatch.mock.calls.find(
        ([action]) => action.type === "usersList/changeRole/fulfilled"
      );
      expect(fulfilledCall).toBeTruthy();
      expect(fulfilledCall![0].payload).toMatchObject({ role: "admin" });
    });

    it("on 404, rejects with { code: 'not_found' }", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ error: "User not found", code: "USER_NOT_FOUND" }),
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await changeRole({ id: "user-missing", role: "standard" })(dispatch, getState, undefined);

      const rejectedCall = dispatch.mock.calls.find(
        ([action]) => action.type === "usersList/changeRole/rejected"
      );
      expect(rejectedCall).toBeTruthy();
      expect(rejectedCall![0].payload).toMatchObject({ code: "not_found" });
    });

    it("on 404 with no error message in the body, falls back to the default message", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ code: "USER_NOT_FOUND" }),
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await changeRole({ id: "user-missing", role: "standard" })(dispatch, getState, undefined);

      const rejectedCall = dispatch.mock.calls.find(
        ([action]) => action.type === "usersList/changeRole/rejected"
      );
      expect(rejectedCall).toBeTruthy();
      expect(rejectedCall![0].payload).toMatchObject({
        code: "not_found",
        message: "User not found",
      });
    });

    it("on 409 LAST_ADMIN, rejects with { code: 'last_admin' }", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({
          error: "Cannot demote the last active admin account",
          code: "LAST_ADMIN",
        }),
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await changeRole({ id: "user-1", role: "standard" })(dispatch, getState, undefined);

      const rejectedCall = dispatch.mock.calls.find(
        ([action]) => action.type === "usersList/changeRole/rejected"
      );
      expect(rejectedCall).toBeTruthy();
      expect(rejectedCall![0].payload).toMatchObject({ code: "last_admin" });
    });

    it("on 409 LAST_ADMIN with no error message in the body, falls back to the default message", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ code: "LAST_ADMIN" }),
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await changeRole({ id: "user-1", role: "standard" })(dispatch, getState, undefined);

      const rejectedCall = dispatch.mock.calls.find(
        ([action]) => action.type === "usersList/changeRole/rejected"
      );
      expect(rejectedCall).toBeTruthy();
      expect(rejectedCall![0].payload).toMatchObject({
        code: "last_admin",
        message: "Cannot demote the last active admin account",
      });
    });

    it("on network failure, rejects with { code: 'network_error' }", async () => {
      mockFetch.mockRejectedValue(new Error("Network failure"));

      const dispatch = jest.fn();
      const getState = jest.fn();

      await changeRole({ id: "user-1", role: "admin" })(dispatch, getState, undefined);

      const rejectedCall = dispatch.mock.calls.find(
        ([action]) => action.type === "usersList/changeRole/rejected"
      );
      expect(rejectedCall).toBeTruthy();
      expect(rejectedCall![0].payload).toMatchObject({ code: "network_error" });
    });

    it("on non-ok, non-404/409 response, rejects with { code: 'unknown_error' }", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: "boom" }),
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await changeRole({ id: "user-1", role: "admin" })(dispatch, getState, undefined);

      const rejectedCall = dispatch.mock.calls.find(
        ([action]) => action.type === "usersList/changeRole/rejected"
      );
      expect(rejectedCall).toBeTruthy();
      expect(rejectedCall![0].payload).toMatchObject({ code: "unknown_error" });
    });

    it("on non-ok, non-404/409 response with no error message in the body, falls back to the default message", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({}),
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await changeRole({ id: "user-1", role: "admin" })(dispatch, getState, undefined);

      const rejectedCall = dispatch.mock.calls.find(
        ([action]) => action.type === "usersList/changeRole/rejected"
      );
      expect(rejectedCall).toBeTruthy();
      expect(rejectedCall![0].payload).toMatchObject({
        code: "unknown_error",
        message: "Unknown error",
      });
    });
  });

  describe("revokeSessions", () => {
    it("POSTs to /api/admin/users/:id/revoke-sessions", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ ...sampleRow, revoked: 2 }),
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await revokeSessions("user-1")(dispatch, getState, undefined);

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/admin/users/user-1/revoke-sessions",
        expect.objectContaining({ method: "POST" })
      );
    });

    it("on success, dispatches fulfilled with the updated row plus the revoked count", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ ...sampleRow, revoked: 2 }),
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await revokeSessions("user-1")(dispatch, getState, undefined);

      const fulfilledCall = dispatch.mock.calls.find(
        ([action]) => action.type === "usersList/revokeSessions/fulfilled"
      );
      expect(fulfilledCall).toBeTruthy();
      expect(fulfilledCall![0].payload).toMatchObject({ ...sampleRow, revoked: 2 });
    });

    it("on a zero-session account, dispatches fulfilled with revoked: 0 (not an error)", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ ...sampleRow, revoked: 0 }),
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await revokeSessions("user-1")(dispatch, getState, undefined);

      const fulfilledCall = dispatch.mock.calls.find(
        ([action]) => action.type === "usersList/revokeSessions/fulfilled"
      );
      expect(fulfilledCall).toBeTruthy();
      expect(fulfilledCall![0].payload).toMatchObject({ revoked: 0 });
    });

    it("on 404, rejects with { code: 'not_found' }", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ error: "User not found", code: "USER_NOT_FOUND" }),
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await revokeSessions("user-missing")(dispatch, getState, undefined);

      const rejectedCall = dispatch.mock.calls.find(
        ([action]) => action.type === "usersList/revokeSessions/rejected"
      );
      expect(rejectedCall).toBeTruthy();
      expect(rejectedCall![0].payload).toMatchObject({ code: "not_found" });
    });

    it("on 404 with no error message in the body, falls back to the default message", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ code: "USER_NOT_FOUND" }),
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await revokeSessions("user-missing")(dispatch, getState, undefined);

      const rejectedCall = dispatch.mock.calls.find(
        ([action]) => action.type === "usersList/revokeSessions/rejected"
      );
      expect(rejectedCall).toBeTruthy();
      expect(rejectedCall![0].payload).toMatchObject({
        code: "not_found",
        message: "User not found",
      });
    });

    it("on network failure, rejects with { code: 'network_error' }", async () => {
      mockFetch.mockRejectedValue(new Error("Network failure"));

      const dispatch = jest.fn();
      const getState = jest.fn();

      await revokeSessions("user-1")(dispatch, getState, undefined);

      const rejectedCall = dispatch.mock.calls.find(
        ([action]) => action.type === "usersList/revokeSessions/rejected"
      );
      expect(rejectedCall).toBeTruthy();
      expect(rejectedCall![0].payload).toMatchObject({ code: "network_error" });
    });

    it("on non-ok, non-404 response, rejects with { code: 'unknown_error' }", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: "boom" }),
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await revokeSessions("user-1")(dispatch, getState, undefined);

      const rejectedCall = dispatch.mock.calls.find(
        ([action]) => action.type === "usersList/revokeSessions/rejected"
      );
      expect(rejectedCall).toBeTruthy();
      expect(rejectedCall![0].payload).toMatchObject({ code: "unknown_error" });
    });

    it("on non-ok, non-404 response with no error message in the body, falls back to the default message", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({}),
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await revokeSessions("user-1")(dispatch, getState, undefined);

      const rejectedCall = dispatch.mock.calls.find(
        ([action]) => action.type === "usersList/revokeSessions/rejected"
      );
      expect(rejectedCall).toBeTruthy();
      expect(rejectedCall![0].payload).toMatchObject({
        code: "unknown_error",
        message: "Unknown error",
      });
    });
  });
});
