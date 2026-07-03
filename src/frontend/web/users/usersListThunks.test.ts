/**
 * usersListThunks.test.ts — unit tests for the admin user roster Redux thunk
 *
 * Stubs global fetch; asserts correct request construction and response mapping.
 */

import { listUsers } from "./usersListThunks";

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
});
