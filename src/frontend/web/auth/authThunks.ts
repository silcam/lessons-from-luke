import { AppDispatch } from "../../common/state/appState";
import currentUserSlice from "../../common/state/currentUserSlice";
import { authClient } from "./authClient";

export function loadCurrentUser() {
  return async (dispatch: AppDispatch) => {
    const result = await authClient.getSession();
    if (result?.data?.user) {
      const { id, admin } = result.data.user as { id: string; admin?: boolean };
      dispatch(currentUserSlice.actions.setUser({ id, admin: Boolean(admin) }));
    } else {
      dispatch(currentUserSlice.actions.setUser(null));
    }
  };
}

export function pushLogin(login: { email: string; password: string }) {
  return async (dispatch: AppDispatch) => {
    try {
      const result = await authClient.signIn.email({
        email: login.email,
        password: login.password,
        callbackURL: "/",
      });
      if (result.error) {
        dispatch(
          currentUserSlice.actions.setError(
            result.error.message ?? "An error occurred. Please try again."
          )
        );
      } else if (result.data?.user) {
        const { id, admin } = result.data.user as {
          id: string;
          admin?: boolean;
        };
        dispatch(
          currentUserSlice.actions.setUser({ id, admin: Boolean(admin) })
        );
      }
    } catch {
      dispatch(
        currentUserSlice.actions.setError(
          "An error occurred. Please try again."
        )
      );
    }
  };
}

export function pushLogout() {
  return async (dispatch: AppDispatch) => {
    await authClient.signOut();
    dispatch(currentUserSlice.actions.setUser(null));
  };
}
