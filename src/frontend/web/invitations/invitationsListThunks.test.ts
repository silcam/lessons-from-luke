/**
 * invitationsListThunks.test.ts — unit tests for invitation list/retract/recopy Redux thunks
 *
 * Stubs global fetch; asserts correct request construction and response mapping.
 */

import {
  listInvitations,
  retractInvitation,
  getInvitationLink,
  resendInvitationEmail,
} from "./invitationsListThunks";

const mockFetch = jest.fn();
global.fetch = mockFetch;

describe("invitationsListThunks", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const sampleSummary = {
    id: "inv-1",
    email: "user@example.com",
    role: "standard",
    status: "pending",
    createdAt: "2026-06-01T00:00:00.000Z",
    expiresAt: "2026-07-01T00:00:00.000Z",
    acceptedAt: null,
    invitedByEmail: "admin@example.com",
  };

  describe("listInvitations", () => {
    it("GETs /api/admin/invitations", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [sampleSummary],
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await listInvitations()(dispatch, getState, undefined);

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/admin/invitations",
        expect.objectContaining({ method: "GET" })
      );
    });

    it("on success, dispatches fulfilled with array of summaries", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [sampleSummary],
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await listInvitations()(dispatch, getState, undefined);

      const fulfilledCall = dispatch.mock.calls.find(
        ([action]) => action.type === "invitationsList/listInvitations/fulfilled"
      );
      expect(fulfilledCall).toBeTruthy();
      expect(fulfilledCall![0].payload).toEqual([sampleSummary]);
    });

    it("on network failure, rejects with { code: 'network_error' }", async () => {
      mockFetch.mockRejectedValue(new Error("Network failure"));

      const dispatch = jest.fn();
      const getState = jest.fn();

      await listInvitations()(dispatch, getState, undefined);

      const rejectedCall = dispatch.mock.calls.find(
        ([action]) => action.type === "invitationsList/listInvitations/rejected"
      );
      expect(rejectedCall).toBeTruthy();
      expect(rejectedCall![0].payload).toMatchObject({ code: "network_error" });
    });
  });

  describe("retractInvitation", () => {
    it("POSTs to /api/admin/invitations/:id/retract", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ ...sampleSummary, status: "retracted" }),
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await retractInvitation("inv-1")(dispatch, getState, undefined);

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/admin/invitations/inv-1/retract",
        expect.objectContaining({ method: "POST" })
      );
    });

    it("on success, dispatches fulfilled with updated summary", async () => {
      const retracted = { ...sampleSummary, status: "retracted" };
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => retracted,
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await retractInvitation("inv-1")(dispatch, getState, undefined);

      const fulfilledCall = dispatch.mock.calls.find(
        ([action]) => action.type === "invitationsList/retractInvitation/fulfilled"
      );
      expect(fulfilledCall).toBeTruthy();
      expect(fulfilledCall![0].payload).toMatchObject({ status: "retracted" });
    });

    it("on 404, rejects with { code: 'not_found' }", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ error: "Invitation not found" }),
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await retractInvitation("inv-missing")(dispatch, getState, undefined);

      const rejectedCall = dispatch.mock.calls.find(
        ([action]) => action.type === "invitationsList/retractInvitation/rejected"
      );
      expect(rejectedCall).toBeTruthy();
      expect(rejectedCall![0].payload).toMatchObject({ code: "not_found" });
    });

    it("on 409 not-pending, rejects with { code: 'not_pending' }", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ error: "Invitation is not pending" }),
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await retractInvitation("inv-1")(dispatch, getState, undefined);

      const rejectedCall = dispatch.mock.calls.find(
        ([action]) => action.type === "invitationsList/retractInvitation/rejected"
      );
      expect(rejectedCall).toBeTruthy();
      expect(rejectedCall![0].payload).toMatchObject({ code: "not_pending" });
    });
  });

  describe("getInvitationLink", () => {
    it("GETs /api/admin/invitations/:id/link", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ link: "https://example.com/invitation/tok123" }),
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await getInvitationLink("inv-1")(dispatch, getState, undefined);

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/admin/invitations/inv-1/link",
        expect.objectContaining({ method: "GET" })
      );
    });

    it("on success, dispatches fulfilled with { id, link }", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ link: "https://example.com/invitation/tok123" }),
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await getInvitationLink("inv-1")(dispatch, getState, undefined);

      const fulfilledCall = dispatch.mock.calls.find(
        ([action]) => action.type === "invitationsList/getInvitationLink/fulfilled"
      );
      expect(fulfilledCall).toBeTruthy();
      expect(fulfilledCall![0].payload).toMatchObject({
        id: "inv-1",
        link: "https://example.com/invitation/tok123",
      });
    });

    it("on 409 not-pending, rejects with { code: 'not_pending' }", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ error: "Invitation is not pending" }),
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await getInvitationLink("inv-1")(dispatch, getState, undefined);

      const rejectedCall = dispatch.mock.calls.find(
        ([action]) => action.type === "invitationsList/getInvitationLink/rejected"
      );
      expect(rejectedCall).toBeTruthy();
      expect(rejectedCall![0].payload).toMatchObject({ code: "not_pending" });
    });
  });

  describe("resendInvitationEmail", () => {
    it("POSTs to /api/admin/invitations/:id/resend", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ emailSent: true }),
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await resendInvitationEmail("inv-1")(dispatch, getState, undefined);

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/admin/invitations/inv-1/resend",
        expect.objectContaining({ method: "POST" })
      );
    });

    it("on success, dispatches fulfilled with { id, emailSent }", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ emailSent: true }),
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await resendInvitationEmail("inv-1")(dispatch, getState, undefined);

      const fulfilledCall = dispatch.mock.calls.find(
        ([action]) => action.type === "invitationsList/resendInvitationEmail/fulfilled"
      );
      expect(fulfilledCall).toBeTruthy();
      expect(fulfilledCall![0].payload).toMatchObject({ id: "inv-1", emailSent: true });
    });

    it("on 409 not-pending, rejects with { code: 'not_pending' }", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ error: "Invitation is not pending" }),
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await resendInvitationEmail("inv-1")(dispatch, getState, undefined);

      const rejectedCall = dispatch.mock.calls.find(
        ([action]) => action.type === "invitationsList/resendInvitationEmail/rejected"
      );
      expect(rejectedCall).toBeTruthy();
      expect(rejectedCall![0].payload).toMatchObject({ code: "not_pending" });
    });

    it("on 429 throttled, rejects with { code: 'throttled' }", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({
          error: "Too many resend requests for this invitation. Please try again later.",
        }),
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await resendInvitationEmail("inv-1")(dispatch, getState, undefined);

      const rejectedCall = dispatch.mock.calls.find(
        ([action]) => action.type === "invitationsList/resendInvitationEmail/rejected"
      );
      expect(rejectedCall).toBeTruthy();
      expect(rejectedCall![0].payload).toMatchObject({ code: "throttled" });
    });
  });
});
