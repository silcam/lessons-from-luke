// eslint-disable-next-line @typescript-eslint/no-require-imports
const sliceModule = require("./currentUserSlice");
const currentUserSlice = sliceModule.default;
// The new thunks will have new signatures; we import via require to avoid TS compile errors on old sigs
const { loadCurrentUser, pushLogin, pushLogout } = sliceModule as {
  loadCurrentUser: () => (dispatch: jest.Mock) => Promise<void>;
  pushLogin: (login: { email: string; password: string }) => (dispatch: jest.Mock) => Promise<void>;
  pushLogout: () => (dispatch: jest.Mock) => Promise<void>;
};
import { User } from "../../../core/models/User";

jest.mock(
  "../../../web/auth/authClient",
  () => ({
    authClient: {
      getSession: jest.fn(),
      signIn: { email: jest.fn() },
      signOut: jest.fn(),
    },
  }),
  { virtual: true }
);

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { authClient } = require("../../../web/auth/authClient") as {
  authClient: {
    getSession: jest.Mock;
    signIn: { email: jest.Mock };
    signOut: jest.Mock;
  };
};

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "u1",
    admin: false,
    ...overrides,
  };
}

const initialState = { user: null, locale: "en" as const, loaded: false };

describe("currentUserSlice reducers", () => {
  describe("setLocale", () => {
    it("sets the locale", () => {
      const state = currentUserSlice.reducer(
        initialState,
        currentUserSlice.actions.setLocale("fr")
      );

      expect(state.locale).toBe("fr");
    });

    it("sets locale regardless of whether user is set", () => {
      const stateWithUser = { ...initialState, user: makeUser() };

      const state = currentUserSlice.reducer(
        stateWithUser,
        currentUserSlice.actions.setLocale("fr")
      );

      expect(state.locale).toBe("fr");
    });
  });

  describe("setLocaleIfNoUser", () => {
    it("sets locale when there is no user", () => {
      const state = currentUserSlice.reducer(
        initialState,
        currentUserSlice.actions.setLocaleIfNoUser("fr")
      );

      expect(state.locale).toBe("fr");
    });

    it("does not change locale when user is set", () => {
      const stateWithUser = {
        ...initialState,
        user: makeUser(),
        locale: "en" as const,
      };

      const state = currentUserSlice.reducer(
        stateWithUser,
        currentUserSlice.actions.setLocaleIfNoUser("fr")
      );

      expect(state.locale).toBe("en");
    });
  });

  describe("setUser", () => {
    it("sets the user and marks loaded as true", () => {
      const user = makeUser({ id: "u5", admin: true });

      const state = currentUserSlice.reducer(
        initialState,
        currentUserSlice.actions.setUser(user)
      );

      expect(state.user).toEqual(user);
      expect(state.loaded).toBe(true);
    });

    it("sets user to null and marks loaded as true", () => {
      const stateWithUser = { ...initialState, user: makeUser() };

      const state = currentUserSlice.reducer(
        stateWithUser,
        currentUserSlice.actions.setUser(null)
      );

      expect(state.user).toBeNull();
      expect(state.loaded).toBe(true);
    });
  });

  describe("logout", () => {
    it("clears the user", () => {
      const stateWithUser = { ...initialState, user: makeUser(), loaded: true };

      const state = currentUserSlice.reducer(
        stateWithUser,
        currentUserSlice.actions.logout()
      );

      expect(state.user).toBeNull();
    });
  });

  describe("initial state", () => {
    it("has user null and loaded false", () => {
      const state = currentUserSlice.reducer(undefined, { type: "@@INIT" });

      expect(state.user).toBeNull();
      expect(state.loaded).toBe(false);
    });

    it("after setUser with a user, has user set and loaded true", () => {
      const user = makeUser({ id: "u1", admin: true });

      const state = currentUserSlice.reducer(
        undefined,
        currentUserSlice.actions.setUser(user)
      );

      expect(state.user).toEqual({ id: "u1", admin: true });
      expect(state.loaded).toBe(true);
    });
  });
});

describe("currentUserSlice thunks", () => {
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
