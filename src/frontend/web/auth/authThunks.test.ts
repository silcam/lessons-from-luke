import { loadCurrentUser, pushLogin, pushLogout } from "./authThunks";
import currentUserSlice from "../../common/state/currentUserSlice";

jest.mock("./authClient", () => ({
  authClient: {
    getSession: jest.fn(),
    signIn: { email: jest.fn() },
    signOut: jest.fn(),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { authClient } = require("./authClient") as {
  authClient: {
    getSession: jest.Mock;
    signIn: { email: jest.Mock };
    signOut: jest.Mock;
  };
};

describe("auth thunks (web/auth/authThunks)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("loadCurrentUser", () => {
    it("calls authClient.getSession and dispatches setUser with user when session exists", async () => {
      (authClient.getSession as jest.Mock).mockResolvedValue({
        data: { user: { id: "u1", email: "user@example.com" } },
      });
      const dispatch = jest.fn();

      await loadCurrentUser()(dispatch);

      expect(authClient.getSession).toHaveBeenCalled();
      expect(dispatch).toHaveBeenCalledWith(
        currentUserSlice.actions.setUser(expect.objectContaining({ id: "u1" }))
      );
    });

    it("calls authClient.getSession and dispatches setUser(null) when no session", async () => {
      (authClient.getSession as jest.Mock).mockResolvedValue({ data: null });
      const dispatch = jest.fn();

      await loadCurrentUser()(dispatch);

      expect(authClient.getSession).toHaveBeenCalled();
      expect(dispatch).toHaveBeenCalledWith(currentUserSlice.actions.setUser(null));
    });
  });

  describe("pushLogin", () => {
    it("calls authClient.signIn.email with email, password, and callbackURL '/'", async () => {
      const login = { email: "admin@example.com", password: "secret" };
      (authClient.signIn.email as jest.Mock).mockResolvedValue({
        data: { user: { id: "u1", email: "admin@example.com" } },
        error: null,
      });
      const dispatch = jest.fn();

      await pushLogin(login)(dispatch);

      expect(authClient.signIn.email).toHaveBeenCalledWith({
        email: "admin@example.com",
        password: "secret",
        callbackURL: "/",
      });
    });

    it("on success, dispatches setUser with id:string and admin:true from response", async () => {
      const login = { email: "admin@example.com", password: "secret" };
      (authClient.signIn.email as jest.Mock).mockResolvedValue({
        data: { user: { id: "u1", email: "admin@example.com", admin: true } },
        error: null,
      });
      const dispatch = jest.fn();

      await pushLogin(login)(dispatch);

      expect(dispatch).toHaveBeenCalledWith(
        currentUserSlice.actions.setUser(expect.objectContaining({ id: "u1", admin: true }))
      );
    });

    it("on success for a non-admin user, dispatches setUser with admin:false", async () => {
      const login = { email: "nonadmin@example.com", password: "secret" };
      (authClient.signIn.email as jest.Mock).mockResolvedValue({
        data: { user: { id: "u2", email: "nonadmin@example.com", admin: false } },
        error: null,
      });
      const dispatch = jest.fn();

      await pushLogin(login)(dispatch);

      expect(dispatch).toHaveBeenCalledWith(
        currentUserSlice.actions.setUser(expect.objectContaining({ id: "u2", admin: false }))
      );
    });

    it("on success when admin field is absent, dispatches setUser with admin:false", async () => {
      const login = { email: "nonadmin@example.com", password: "secret" };
      (authClient.signIn.email as jest.Mock).mockResolvedValue({
        data: { user: { id: "u3", email: "nonadmin@example.com" } },
        error: null,
      });
      const dispatch = jest.fn();

      await pushLogin(login)(dispatch);

      expect(dispatch).toHaveBeenCalledWith(
        currentUserSlice.actions.setUser(expect.objectContaining({ id: "u3", admin: false }))
      );
    });

    it("on 401 failure, does NOT dispatch setUser with a user", async () => {
      const login = { email: "wrong@example.com", password: "wrong" };
      (authClient.signIn.email as jest.Mock).mockResolvedValue({
        data: null,
        error: { status: 401, message: "Invalid credentials" },
      });
      const dispatch = jest.fn();

      await pushLogin(login)(dispatch);

      const setUserWithUserCalls = dispatch.mock.calls.filter(
        ([action]) =>
          action.type === "currentUser/setUser" && action.payload !== null
      );
      expect(setUserWithUserCalls).toHaveLength(0);
    });

    it("on failure, dispatches something to handle the error state", async () => {
      const login = { email: "wrong@example.com", password: "wrong" };
      (authClient.signIn.email as jest.Mock).mockResolvedValue({
        data: null,
        error: { status: 401, message: "Invalid credentials" },
      });
      const dispatch = jest.fn();

      await pushLogin(login)(dispatch);

      expect(dispatch).toHaveBeenCalled();
    });

    it("on 400 error, dispatches setError with a fallback message", async () => {
      const login = { email: "bad@example.com", password: "bad" };
      (authClient.signIn.email as jest.Mock).mockResolvedValue({
        data: null,
        error: { status: 400, message: "Bad request" },
      });
      const dispatch = jest.fn();

      await pushLogin(login)(dispatch);

      expect(dispatch).toHaveBeenCalledWith(
        currentUserSlice.actions.setError(expect.any(String))
      );
    });

    it("on 500 error, dispatches setError with a fallback message", async () => {
      const login = { email: "user@example.com", password: "pass" };
      (authClient.signIn.email as jest.Mock).mockResolvedValue({
        data: null,
        error: { status: 500, message: "Internal server error" },
      });
      const dispatch = jest.fn();

      await pushLogin(login)(dispatch);

      expect(dispatch).toHaveBeenCalledWith(
        currentUserSlice.actions.setError(expect.any(String))
      );
    });

    it("on 429 error, dispatches setError with a fallback message", async () => {
      const login = { email: "user@example.com", password: "pass" };
      (authClient.signIn.email as jest.Mock).mockResolvedValue({
        data: null,
        error: { status: 429, message: "Too many requests" },
      });
      const dispatch = jest.fn();

      await pushLogin(login)(dispatch);

      expect(dispatch).toHaveBeenCalledWith(
        currentUserSlice.actions.setError(expect.any(String))
      );
    });

    it("on network rejection (thrown error), dispatches setError with a fallback message", async () => {
      const login = { email: "user@example.com", password: "pass" };
      (authClient.signIn.email as jest.Mock).mockRejectedValue(
        new Error("Network failure")
      );
      const dispatch = jest.fn();

      await pushLogin(login)(dispatch);

      expect(dispatch).toHaveBeenCalledWith(
        currentUserSlice.actions.setError(expect.any(String))
      );
    });
  });

  describe("pushLogout", () => {
    it("calls authClient.signOut", async () => {
      (authClient.signOut as jest.Mock).mockResolvedValue({});
      const dispatch = jest.fn();

      await pushLogout()(dispatch);

      expect(authClient.signOut).toHaveBeenCalled();
    });

    it("dispatches setUser(null) or logout() after sign out", async () => {
      (authClient.signOut as jest.Mock).mockResolvedValue({});
      const dispatch = jest.fn();

      await pushLogout()(dispatch);

      const logoutCalls = dispatch.mock.calls.filter(
        ([action]) =>
          action.type === "currentUser/logout" ||
          (action.type === "currentUser/setUser" && action.payload === null)
      );
      expect(logoutCalls.length).toBeGreaterThan(0);
    });
  });
});
