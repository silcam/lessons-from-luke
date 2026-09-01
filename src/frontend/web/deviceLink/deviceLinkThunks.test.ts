/**
 * deviceLinkThunks.test.ts — unit tests for device link thunks
 *
 * Spec: specs/004-desktop-auth-pairing/plan.md §Project Structure (frontend/web/deviceLink/deviceLinkThunks.ts)
 * Plan: data-model.md §Entity 1 (two-step claim-then-approve flow)
 *
 * Stubs global fetch; asserts correct request construction and response mapping.
 *
 * Two-step flow: claimCode (GET /api/auth/device?user_code=) MUST be called before
 * approveCode/denyCode. Without the claim step, approve returns DEVICE_CODE_NOT_CLAIMED (400).
 */

import { claimCode, approveCode, denyCode } from "./deviceLinkThunks";

const mockFetch = jest.fn();
global.fetch = mockFetch;

describe("deviceLinkThunks", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("claimCode", () => {
    it("GETs /api/auth/device?user_code=<userCode>", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({}),
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await claimCode("WDJB-MJHT")(dispatch, getState, undefined);

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/auth/device?user_code=WDJB-MJHT",
        expect.objectContaining({ method: "GET" })
      );
    });

    it("on 200, dispatches fulfilled", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({}),
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await claimCode("WDJB-MJHT")(dispatch, getState, undefined);

      const fulfilledCall = dispatch.mock.calls.find(
        ([action]) => action.type === "deviceLink/claimCode/fulfilled"
      );
      expect(fulfilledCall).toBeTruthy();
    });

    it("on 410 (expired), rejects with { code: 'expired' }", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 410,
        json: async () => ({ error: "Device code has expired." }),
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await claimCode("WDJB-MJHT")(dispatch, getState, undefined);

      const rejectedCall = dispatch.mock.calls.find(
        ([action]) => action.type === "deviceLink/claimCode/rejected"
      );
      expect(rejectedCall).toBeTruthy();
      expect(rejectedCall![0].payload).toMatchObject({ code: "expired" });
    });

    it("on 429 (rate limited), rejects with { code: 'rate_limited' }", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({ error: "Too many requests." }),
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await claimCode("WDJB-MJHT")(dispatch, getState, undefined);

      const rejectedCall = dispatch.mock.calls.find(
        ([action]) => action.type === "deviceLink/claimCode/rejected"
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

      await claimCode("WDJB-MJHT")(dispatch, getState, undefined);

      const rejectedCall = dispatch.mock.calls.find(
        ([action]) => action.type === "deviceLink/claimCode/rejected"
      );
      expect(rejectedCall).toBeTruthy();
      expect(rejectedCall![0].payload).toMatchObject({ code: "network_error" });
    });

    it("on fetch throw, rejects with { code: 'network_error' }", async () => {
      mockFetch.mockRejectedValue(new Error("Network failure"));

      const dispatch = jest.fn();
      const getState = jest.fn();

      await claimCode("WDJB-MJHT")(dispatch, getState, undefined);

      const rejectedCall = dispatch.mock.calls.find(
        ([action]) => action.type === "deviceLink/claimCode/rejected"
      );
      expect(rejectedCall).toBeTruthy();
      expect(rejectedCall![0].payload).toMatchObject({ code: "network_error" });
    });
  });

  describe("approveCode", () => {
    it("POSTs to /api/auth/device/approve with { userCode }", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({}),
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await approveCode("WDJB-MJHT")(dispatch, getState, undefined);

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/auth/device/approve",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({ "Content-Type": "application/json" }),
          body: JSON.stringify({ userCode: "WDJB-MJHT" }),
        })
      );
    });

    it("on 200 (claim before approve), dispatches fulfilled", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({}),
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await approveCode("WDJB-MJHT")(dispatch, getState, undefined);

      const fulfilledCall = dispatch.mock.calls.find(
        ([action]) => action.type === "deviceLink/approveCode/fulfilled"
      );
      expect(fulfilledCall).toBeTruthy();
    });

    it("on 400 DEVICE_CODE_NOT_CLAIMED (approve without prior claim), rejects with { code: 'not_claimed' }", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: "DEVICE_CODE_NOT_CLAIMED" }),
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await approveCode("WDJB-MJHT")(dispatch, getState, undefined);

      const rejectedCall = dispatch.mock.calls.find(
        ([action]) => action.type === "deviceLink/approveCode/rejected"
      );
      expect(rejectedCall).toBeTruthy();
      expect(rejectedCall![0].payload).toMatchObject({ code: "not_claimed" });
    });

    it("on 410 (expired), rejects with { code: 'expired' }", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 410,
        json: async () => ({ error: "Device code has expired." }),
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await approveCode("WDJB-MJHT")(dispatch, getState, undefined);

      const rejectedCall = dispatch.mock.calls.find(
        ([action]) => action.type === "deviceLink/approveCode/rejected"
      );
      expect(rejectedCall).toBeTruthy();
      expect(rejectedCall![0].payload).toMatchObject({ code: "expired" });
    });

    it("on 429 (rate limited), rejects with { code: 'rate_limited' }", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({ error: "Too many requests." }),
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await approveCode("WDJB-MJHT")(dispatch, getState, undefined);

      const rejectedCall = dispatch.mock.calls.find(
        ([action]) => action.type === "deviceLink/approveCode/rejected"
      );
      expect(rejectedCall).toBeTruthy();
      expect(rejectedCall![0].payload).toMatchObject({ code: "rate_limited" });
    });

    it("on fetch throw, rejects with { code: 'network_error' }", async () => {
      mockFetch.mockRejectedValue(new Error("Network failure"));

      const dispatch = jest.fn();
      const getState = jest.fn();

      await approveCode("WDJB-MJHT")(dispatch, getState, undefined);

      const rejectedCall = dispatch.mock.calls.find(
        ([action]) => action.type === "deviceLink/approveCode/rejected"
      );
      expect(rejectedCall).toBeTruthy();
      expect(rejectedCall![0].payload).toMatchObject({ code: "network_error" });
    });
  });

  describe("denyCode", () => {
    it("POSTs to /api/auth/device/deny with { userCode }", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({}),
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await denyCode("WDJB-MJHT")(dispatch, getState, undefined);

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/auth/device/deny",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({ "Content-Type": "application/json" }),
          body: JSON.stringify({ userCode: "WDJB-MJHT" }),
        })
      );
    });

    it("on 200, dispatches fulfilled (declined state set)", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({}),
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await denyCode("WDJB-MJHT")(dispatch, getState, undefined);

      const fulfilledCall = dispatch.mock.calls.find(
        ([action]) => action.type === "deviceLink/denyCode/fulfilled"
      );
      expect(fulfilledCall).toBeTruthy();
    });

    it("on 410 (expired), rejects with { code: 'expired' }", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 410,
        json: async () => ({ error: "Device code has expired." }),
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await denyCode("WDJB-MJHT")(dispatch, getState, undefined);

      const rejectedCall = dispatch.mock.calls.find(
        ([action]) => action.type === "deviceLink/denyCode/rejected"
      );
      expect(rejectedCall).toBeTruthy();
      expect(rejectedCall![0].payload).toMatchObject({ code: "expired" });
    });

    it("on 429 (rate limited), rejects with { code: 'rate_limited' }", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({ error: "Too many requests." }),
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await denyCode("WDJB-MJHT")(dispatch, getState, undefined);

      const rejectedCall = dispatch.mock.calls.find(
        ([action]) => action.type === "deviceLink/denyCode/rejected"
      );
      expect(rejectedCall).toBeTruthy();
      expect(rejectedCall![0].payload).toMatchObject({ code: "rate_limited" });
    });

    it("on fetch throw, rejects with { code: 'network_error' }", async () => {
      mockFetch.mockRejectedValue(new Error("Network failure"));

      const dispatch = jest.fn();
      const getState = jest.fn();

      await denyCode("WDJB-MJHT")(dispatch, getState, undefined);

      const rejectedCall = dispatch.mock.calls.find(
        ([action]) => action.type === "deviceLink/denyCode/rejected"
      );
      expect(rejectedCall).toBeTruthy();
      expect(rejectedCall![0].payload).toMatchObject({ code: "network_error" });
    });
  });
});
