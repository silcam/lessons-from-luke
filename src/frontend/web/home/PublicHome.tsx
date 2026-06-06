import React, { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { AppDispatch, AppState } from "../../common/state/appState";
import { pushLogin } from "../../common/state/currentUserSlice";
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
  const loginFailed = Boolean(error);

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

        {loginFailed && <Alert danger>{t("Log_in_failed")}</Alert>}
        <Button bigger onClick={logIn} text={t("Log_in")} />
      </HandleKey>
    </MiddleOfPage>
  );
}
