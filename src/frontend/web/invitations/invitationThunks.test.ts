/**
 * invitationThunks.test.ts — unit tests for invitation Redux thunks
 *
 * Stubs global fetch; asserts correct request construction and response mapping.
 */

import { createInvitation } from "./invitationThunks";

const mockFetch = jest.fn();
global.fetch = mockFetch;

describe("invitationThunks", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("createInvitation", () => {
    const successPayload = {
      id: "inv-1",
      email: "user@example.com",
      role: "standard",
      status: "pending",
      link: "https://example.com/accept/tok123",
      expiresAt: "2026-07-18T00:00:00.000Z",
    };

    it("POSTs to /api/admin/invitations with email and role", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => successPayload,
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await createInvitation({ email: "user@example.com", role: "standard" })(
        dispatch,
        getState,
        undefined
      );

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/admin/invitations",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({ "Content-Type": "application/json" }),
          body: JSON.stringify({ email: "user@example.com", role: "standard" }),
        })
      );
    });

    it("on success (201), dispatches fulfilled with the invitation payload", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => successPayload,
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await createInvitation({ email: "user@example.com", role: "standard" })(
        dispatch,
        getState,
        undefined
      );

      const fulfilledCall = dispatch.mock.calls.find(
        ([action]) => action.type === "invitations/createInvitation/fulfilled"
      );
      expect(fulfilledCall).toBeTruthy();
      expect(fulfilledCall![0].payload).toEqual(successPayload);
    });

    it("on 409 account-exists, rejects with { code: 'account_exists' }", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ error: "An account already exists for taken@example.com", code: "ACCOUNT_EXISTS" }),
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await createInvitation({ email: "taken@example.com", role: "standard" })(
        dispatch,
        getState,
        undefined
      );

      const rejectedCall = dispatch.mock.calls.find(
        ([action]) => action.type === "invitations/createInvitation/rejected"
      );
      expect(rejectedCall).toBeTruthy();
      expect(rejectedCall![0].payload).toMatchObject({ code: "account_exists" });
    });

    it("on 409 active-pending, rejects with { code: 'active_pending' }", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ error: "An active pending invitation already exists for pending@example.com", code: "PENDING_INVITE_EXISTS" }),
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await createInvitation({ email: "pending@example.com", role: "standard" })(
        dispatch,
        getState,
        undefined
      );

      const rejectedCall = dispatch.mock.calls.find(
        ([action]) => action.type === "invitations/createInvitation/rejected"
      );
      expect(rejectedCall).toBeTruthy();
      expect(rejectedCall![0].payload).toMatchObject({ code: "active_pending" });
    });

    it("on 400, rejects with { code: 'validation_error' }", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: "email and role are required" }),
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await createInvitation({ email: "", role: "" })(dispatch, getState, undefined);

      const rejectedCall = dispatch.mock.calls.find(
        ([action]) => action.type === "invitations/createInvitation/rejected"
      );
      expect(rejectedCall).toBeTruthy();
      expect(rejectedCall![0].payload).toMatchObject({ code: "validation_error" });
    });

    it("on network failure, rejects with { code: 'network_error' }", async () => {
      mockFetch.mockRejectedValue(new Error("Network failure"));

      const dispatch = jest.fn();
      const getState = jest.fn();

      await createInvitation({ email: "user@example.com", role: "standard" })(
        dispatch,
        getState,
        undefined
      );

      const rejectedCall = dispatch.mock.calls.find(
        ([action]) => action.type === "invitations/createInvitation/rejected"
      );
      expect(rejectedCall).toBeTruthy();
      expect(rejectedCall![0].payload).toMatchObject({ code: "network_error" });
    });
  });
});
