/**
 * adminUsersThunks.test.ts — unit tests for admin user list / revoke thunks
 *
 * Spec: specs/004-desktop-auth-pairing/spec.md §FR-017
 * Plan: specs/004-desktop-auth-pairing/plan.md §Project Structure
 *       (frontend/web/home/AdminHome.tsx)
 *
 * Stubs global fetch; asserts correct request construction and response mapping.
 */

import { listAdminUsers, revokeUserDeviceAccess } from "./adminUsersThunks";

const mockFetch = jest.fn();
global.fetch = mockFetch;

describe("adminUsersThunks", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const sampleUser = {
    id: "user-1",
    email: "alice@example.com",
    name: "Alice",
    admin: false,
  };

  // -------------------------------------------------------------------------
  // listAdminUsers
  // -------------------------------------------------------------------------

  describe("listAdminUsers", () => {
    it("GETs /api/admin/users", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [sampleUser],
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await listAdminUsers()(dispatch, getState, undefined);

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/admin/users",
        expect.objectContaining({ method: "GET" })
      );
    });

    it("on success, dispatches fulfilled with array of users", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [sampleUser],
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await listAdminUsers()(dispatch, getState, undefined);

      const fulfilledCall = dispatch.mock.calls.find(
        ([action]) => action.type === "adminUsers/listAdminUsers/fulfilled"
      );
      expect(fulfilledCall).toBeTruthy();
      expect(fulfilledCall![0].payload).toEqual([sampleUser]);
    });

    it("on non-ok response, rejects with { code: 'unknown_error' }", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: "Internal server error" }),
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await listAdminUsers()(dispatch, getState, undefined);

      const rejectedCall = dispatch.mock.calls.find(
        ([action]) => action.type === "adminUsers/listAdminUsers/rejected"
      );
      expect(rejectedCall).toBeTruthy();
      expect(rejectedCall![0].payload).toMatchObject({ code: "unknown_error" });
    });

    it("on network failure, rejects with { code: 'network_error' }", async () => {
      mockFetch.mockRejectedValue(new Error("Network failure"));

      const dispatch = jest.fn();
      const getState = jest.fn();

      await listAdminUsers()(dispatch, getState, undefined);

      const rejectedCall = dispatch.mock.calls.find(
        ([action]) => action.type === "adminUsers/listAdminUsers/rejected"
      );
      expect(rejectedCall).toBeTruthy();
      expect(rejectedCall![0].payload).toMatchObject({ code: "network_error" });
    });
  });

  // -------------------------------------------------------------------------
  // revokeUserDeviceAccess
  // -------------------------------------------------------------------------

  describe("revokeUserDeviceAccess", () => {
    it("POSTs to /api/admin/users/:userId/revoke-sessions", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true, revokedCount: 3 }),
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await revokeUserDeviceAccess("user-1")(dispatch, getState, undefined);

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/admin/users/user-1/revoke-sessions",
        expect.objectContaining({ method: "POST" })
      );
    });

    it("on success, dispatches fulfilled with { userId, revokedCount }", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true, revokedCount: 3 }),
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await revokeUserDeviceAccess("user-1")(dispatch, getState, undefined);

      const fulfilledCall = dispatch.mock.calls.find(
        ([action]) => action.type === "adminUsers/revokeUserDeviceAccess/fulfilled"
      );
      expect(fulfilledCall).toBeTruthy();
      expect(fulfilledCall![0].payload).toMatchObject({ userId: "user-1", revokedCount: 3 });
    });

    it("on 404, rejects with { code: 'not_found' }", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ error: "User not found" }),
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await revokeUserDeviceAccess("no-such-user")(dispatch, getState, undefined);

      const rejectedCall = dispatch.mock.calls.find(
        ([action]) => action.type === "adminUsers/revokeUserDeviceAccess/rejected"
      );
      expect(rejectedCall).toBeTruthy();
      expect(rejectedCall![0].payload).toMatchObject({ code: "not_found" });
    });

    it("on network failure, rejects with { code: 'network_error' }", async () => {
      mockFetch.mockRejectedValue(new Error("Network failure"));

      const dispatch = jest.fn();
      const getState = jest.fn();

      await revokeUserDeviceAccess("user-1")(dispatch, getState, undefined);

      const rejectedCall = dispatch.mock.calls.find(
        ([action]) => action.type === "adminUsers/revokeUserDeviceAccess/rejected"
      );
      expect(rejectedCall).toBeTruthy();
      expect(rejectedCall![0].payload).toMatchObject({ code: "network_error" });
    });
  });
});
