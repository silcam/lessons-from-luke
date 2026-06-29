/**
 * redeemInvitationThunks.test.ts — unit tests for invitation redemption thunks
 *
 * Stubs global fetch; asserts correct request construction and response mapping.
 */

import { lookupInvitation, acceptInvitation } from "./redeemInvitationThunks";

const mockFetch = jest.fn();
global.fetch = mockFetch;

describe("redeemInvitationThunks", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("lookupInvitation", () => {
    it("GETs /api/auth/invitation/:token", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ email: "user@example.com" }),
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await lookupInvitation("tok123")(dispatch, getState, undefined);

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/auth/invitation/tok123",
        expect.objectContaining({ method: "GET" })
      );
    });

    it("on 200, dispatches fulfilled with { email }", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ email: "user@example.com" }),
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await lookupInvitation("tok123")(dispatch, getState, undefined);

      const fulfilledCall = dispatch.mock.calls.find(
        ([action]) => action.type === "invitations/lookupInvitation/fulfilled"
      );
      expect(fulfilledCall).toBeTruthy();
      expect(fulfilledCall![0].payload).toEqual({ email: "user@example.com" });
    });

    it("on 410, rejects with { code: 'invalid_link' }", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 410,
        json: async () => ({ error: "This invitation link is no longer valid." }),
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await lookupInvitation("expired-tok")(dispatch, getState, undefined);

      const rejectedCall = dispatch.mock.calls.find(
        ([action]) => action.type === "invitations/lookupInvitation/rejected"
      );
      expect(rejectedCall).toBeTruthy();
      expect(rejectedCall![0].payload).toMatchObject({ code: "invalid_link" });
    });

    it("on 429, rejects with { code: 'rate_limited' }", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({ error: "Too many attempts." }),
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await lookupInvitation("tok123")(dispatch, getState, undefined);

      const rejectedCall = dispatch.mock.calls.find(
        ([action]) => action.type === "invitations/lookupInvitation/rejected"
      );
      expect(rejectedCall).toBeTruthy();
      expect(rejectedCall![0].payload).toMatchObject({ code: "rate_limited" });
    });

    it("on other non-200, rejects with { code: 'network_error' }", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: "Internal server error" }),
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await lookupInvitation("tok123")(dispatch, getState, undefined);

      const rejectedCall = dispatch.mock.calls.find(
        ([action]) => action.type === "invitations/lookupInvitation/rejected"
      );
      expect(rejectedCall).toBeTruthy();
      expect(rejectedCall![0].payload).toMatchObject({ code: "network_error" });
    });

    it("on fetch throw, rejects with { code: 'network_error' }", async () => {
      mockFetch.mockRejectedValue(new Error("Network failure"));

      const dispatch = jest.fn();
      const getState = jest.fn();

      await lookupInvitation("tok123")(dispatch, getState, undefined);

      const rejectedCall = dispatch.mock.calls.find(
        ([action]) => action.type === "invitations/lookupInvitation/rejected"
      );
      expect(rejectedCall).toBeTruthy();
      expect(rejectedCall![0].payload).toMatchObject({ code: "network_error" });
    });
  });

  describe("acceptInvitation", () => {
    const validArgs = { token: "tok123", password: "securepassword123", name: "Jane Doe" };

    it("POSTs to /api/auth/invitation/accept with token, password, name", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ email: "user@example.com" }),
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await acceptInvitation(validArgs)(dispatch, getState, undefined);

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/auth/invitation/accept",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({ "Content-Type": "application/json" }),
          body: JSON.stringify(validArgs),
        })
      );
    });

    it("on 200, dispatches fulfilled with { email }", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ email: "user@example.com" }),
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await acceptInvitation(validArgs)(dispatch, getState, undefined);

      const fulfilledCall = dispatch.mock.calls.find(
        ([action]) => action.type === "invitations/acceptInvitation/fulfilled"
      );
      expect(fulfilledCall).toBeTruthy();
      expect(fulfilledCall![0].payload).toEqual({ email: "user@example.com" });
    });

    it("on 400, rejects with { code: 'validation_error' }", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: "Password must be at least 12 characters." }),
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await acceptInvitation({ ...validArgs, password: "short" })(dispatch, getState, undefined);

      const rejectedCall = dispatch.mock.calls.find(
        ([action]) => action.type === "invitations/acceptInvitation/rejected"
      );
      expect(rejectedCall).toBeTruthy();
      expect(rejectedCall![0].payload).toMatchObject({ code: "validation_error" });
    });

    it("on 410, rejects with { code: 'invalid_link' }", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 410,
        json: async () => ({ error: "This invitation link is no longer valid." }),
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await acceptInvitation(validArgs)(dispatch, getState, undefined);

      const rejectedCall = dispatch.mock.calls.find(
        ([action]) => action.type === "invitations/acceptInvitation/rejected"
      );
      expect(rejectedCall).toBeTruthy();
      expect(rejectedCall![0].payload).toMatchObject({ code: "invalid_link" });
    });

    it("on 409, rejects with { code: 'invalid_link' } (already accepted/retracted)", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ error: "This invitation has already been used." }),
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await acceptInvitation(validArgs)(dispatch, getState, undefined);

      const rejectedCall = dispatch.mock.calls.find(
        ([action]) => action.type === "invitations/acceptInvitation/rejected"
      );
      expect(rejectedCall).toBeTruthy();
      expect(rejectedCall![0].payload).toMatchObject({ code: "invalid_link" });
    });

    it("on 429, rejects with { code: 'rate_limited' }", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({ error: "Too many attempts." }),
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await acceptInvitation(validArgs)(dispatch, getState, undefined);

      const rejectedCall = dispatch.mock.calls.find(
        ([action]) => action.type === "invitations/acceptInvitation/rejected"
      );
      expect(rejectedCall).toBeTruthy();
      expect(rejectedCall![0].payload).toMatchObject({ code: "rate_limited" });
    });

    it("on other non-200, rejects with { code: 'network_error' }", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: "Internal server error" }),
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await acceptInvitation(validArgs)(dispatch, getState, undefined);

      const rejectedCall = dispatch.mock.calls.find(
        ([action]) => action.type === "invitations/acceptInvitation/rejected"
      );
      expect(rejectedCall).toBeTruthy();
      expect(rejectedCall![0].payload).toMatchObject({ code: "network_error" });
    });

    it("on fetch throw, rejects with { code: 'network_error' }", async () => {
      mockFetch.mockRejectedValue(new Error("Network failure"));

      const dispatch = jest.fn();
      const getState = jest.fn();

      await acceptInvitation(validArgs)(dispatch, getState, undefined);

      const rejectedCall = dispatch.mock.calls.find(
        ([action]) => action.type === "invitations/acceptInvitation/rejected"
      );
      expect(rejectedCall).toBeTruthy();
      expect(rejectedCall![0].payload).toMatchObject({ code: "network_error" });
    });
  });
});
