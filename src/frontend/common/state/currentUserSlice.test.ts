// eslint-disable-next-line @typescript-eslint/no-require-imports
const sliceModule = require("./currentUserSlice");
const currentUserSlice = sliceModule.default;
import { User } from "../../../core/models/User";

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
