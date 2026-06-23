import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useSearchParams } from "react-router-dom";
import { AppDispatch, AppState } from "../../common/state/appState";
import { pushLogin } from "../auth/authThunks";
import currentUserSlice from "../../common/state/currentUserSlice";
import Button from "../../common/base-components/Button";
import TextInput from "../../common/base-components/TextInput";
import MiddleOfPage from "../../common/base-components/MiddleOfPage";
import PDiv from "../../common/base-components/PDiv";
import Heading from "../../common/base-components/Heading";
import HandleKey from "../../common/base-components/HandleKey";
import Alert from "../../common/base-components/Alert";
import useTranslation from "../../common/util/useTranslation";

export default function PublicHome() {
  const t = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const dispatch = useDispatch<AppDispatch>();
  const error = useSelector((state: AppState) => state.currentUser.error);

  const [searchParams] = useSearchParams();
  const hasReturnTo = searchParams.has("returnTo");

  // On redirect-arrival (any ?returnTo present), clear any stale error so a
  // prior failed-login alert does not bleed onto the contextual prompt.
  useEffect(() => {
    if (hasReturnTo && error) {
      dispatch(currentUserSlice.actions.setError(""));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Do not show a stale login-failed alert when arriving via redirect.
  const loginFailed = Boolean(error) && !hasReturnTo;

  const logIn = () => dispatch(pushLogin({ email, password }));

  return (
    <MiddleOfPage>
      <HandleKey onEnter={logIn}>
        <Heading level={1} text="Lessons from Luke" />
        <Heading level={3} text={t("Log_in")} />
        <PDiv>
          <TextInput
            value={email}
            setValue={(v) => {
              setEmail(v);
            }}
            placeholder={t("Email")}
            autoFocus
          />
        </PDiv>
        <PDiv>
          <TextInput
            value={password}
            setValue={(v) => {
              setPassword(v);
            }}
            placeholder={t("Password")}
            password
          />
        </PDiv>

        {hasReturnTo && (
          <Alert role="alert" aria-live="assertive">
            {t("Please_sign_in_to_continue")}
          </Alert>
        )}
        {loginFailed && <Alert danger>{t("Log_in_failed")}</Alert>}
        <Button bigger onClick={logIn} text={t("Log_in")} />
      </HandleKey>
    </MiddleOfPage>
  );
}
