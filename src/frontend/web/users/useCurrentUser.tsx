import { User, LoginAttempt } from "../../../core/User";
import { useState, useEffect, useContext } from "react";
import ErrorContext from "../../common/ErrorContext";
import useAPI, { APIContext } from "../../api/useAPI";
import I18nContext, { useTranslation, Locale } from "../../common/I18nContext";
import { I18nKey } from "../../locales/en";

type LoginError = "Invalid" | "Unknown";
export type LogInFunc = (
  loginAttempt: LoginAttempt,
  handleError: (e: LoginError) => void
) => void;
export type LogOutFunc = () => Promise<void>;
// export type CreateAccountFunc = (
//   newUser: NewUser,
//   handleError: (msg: I18nKey) => void
// ) => void;

export default function useCurrentUser(): [
  User | null,
  LogInFunc,
  LogOutFunc
  // CreateAccountFunc
] {
  const t = useTranslation();
  const [currentUser, setCurrentUser] = useState<null | User>(null);
  const { setLocale } = useContext(I18nContext);
  // const [, request] = useNetwork();
  const { get, post } = useContext(APIContext);
  // const [, requestThrowsErrorResponses] = useNetwork({
  //   throwErrorsWithResponse: true
  // });

  const { setError } = useContext(ErrorContext);

  const getCurrentUser = async (
    setCurrentUser: (u: User | null) => void
    // setLocale: (loc: Locale) => void
  ) => {
    const user = await get("/api/users/current", {});
    setCurrentUser(user);
    // setLocale(response.data.locale);
  };

  useEffect(() => {
    try {
      getCurrentUser(setCurrentUser);
    } catch (err) {
      setError({ msg: t("UnknownError") });
    }
  }, []);

  const logIn = async (
    loginAttempt: LoginAttempt,
    handleError: (e: LoginError) => void
  ) => {
    try {
      const user = await post("/api/users/login", {}, loginAttempt);
      user && setCurrentUser(user);
    } catch (err) {
      if (err.response && err.response.status === 401) handleError("Invalid");
      else handleError("Unknown");
    }
  };

  const logOut = async () => {
    await post("/api/users/logout", {}, null);
    setCurrentUser(null);
  };

  // const createAccount: CreateAccountFunc = async (newUser, handleError) => {
  //   try {
  //     const response = await requestThrowsErrorResponses(axios =>
  //       axios.post(apiPath("/users"), newUser)
  //     );
  //     response && setCurrentUser(response.data);
  //   } catch (err) {
  //     if (err.response && err.response.status === 422)
  //       handleError(err.response.data.error);
  //     else handleError("Unknown_error");
  //   }
  // };

  return [currentUser, logIn, logOut];
}
