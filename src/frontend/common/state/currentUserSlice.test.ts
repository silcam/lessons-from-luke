import currentUserSlice, {
  loadCurrentUser,
  pushLogin,
  pushLogout
} from "./currentUserSlice";
import { User } from "../../../core/models/User";

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 1,
    admin: false,
    ...overrides
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
      const stateWithUser = { ...initialState, user: makeUser(), locale: "en" as const };

      const state = currentUserSlice.reducer(
        stateWithUser,
        currentUserSlice.actions.setLocaleIfNoUser("fr")
      );

      expect(state.locale).toBe("en");
    });
  });

  describe("setUser", () => {
    it("sets the user and marks loaded as true", () => {
      const user = makeUser({ id: 5, admin: true });

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
});

describe("currentUserSlice thunks", () => {
  describe("loadCurrentUser", () => {
    it("calls GET /api/users/current and dispatches setUser", async () => {
      const user = makeUser({ id: 1, admin: false });
      const get = jest.fn().mockResolvedValue(user);
      const dispatch = jest.fn();

      await loadCurrentUser(get)(dispatch);

      expect(get).toHaveBeenCalledWith("/api/users/current", {});
      expect(dispatch).toHaveBeenCalledWith(
        currentUserSlice.actions.setUser(user)
      );
    });

    it("dispatches setUser(null) even if GET returns null (to mark loaded)", async () => {
      const get = jest.fn().mockResolvedValue(null);
      const dispatch = jest.fn();

      await loadCurrentUser(get)(dispatch);

      expect(dispatch).toHaveBeenCalledWith(
        currentUserSlice.actions.setUser(null)
      );
    });
  });

  describe("pushLogin", () => {
    it("posts login and dispatches setUser", async () => {
      const user = makeUser({ id: 2, admin: true });
      const login = { username: "admin", password: "secret" };
      const post = jest.fn().mockResolvedValue(user);
      const dispatch = jest.fn();

      await pushLogin(login)(post, dispatch);

      expect(post).toHaveBeenCalledWith("/api/users/login", {}, login);
      expect(dispatch).toHaveBeenCalledWith(
        currentUserSlice.actions.setUser(user)
      );
    });

    it("dispatches setUser(null) if post returns null", async () => {
      const login = { username: "wrong", password: "wrong" };
      const post = jest.fn().mockResolvedValue(null);
      const dispatch = jest.fn();

      await pushLogin(login)(post, dispatch);

      expect(dispatch).toHaveBeenCalledWith(
        currentUserSlice.actions.setUser(null)
      );
    });
  });

  describe("pushLogout", () => {
    it("posts logout and dispatches logout action", async () => {
      const post = jest.fn().mockResolvedValue({});
      const dispatch = jest.fn();

      await pushLogout()(post, dispatch);

      expect(post).toHaveBeenCalledWith("/api/users/logout", {}, null);
      expect(dispatch).toHaveBeenCalledWith(
        currentUserSlice.actions.logout()
      );
    });
  });
});
