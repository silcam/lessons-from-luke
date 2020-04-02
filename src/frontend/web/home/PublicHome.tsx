import React, { useState } from "react";
import { usePush } from "../../common/api/useLoad";
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
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginFailed, setLoginFailed] = useState(false);
  const push = usePush();
  const logIn = () =>
    push(pushLogin({ username, password }), appError => {
      if (appError.type == "HTTP" && appError.status == 422) {
        setLoginFailed(true);
        return true;
      }
      return false;
    });

  return (
    <MiddleOfPage>
      <HandleKey onEnter={logIn}>
        <Heading level={1} text="Lessons from Luke" />
        <Heading level={3} text={t("Log_in")} />
        <PDiv>
          <TextInput
            value={username}
            setValue={v => {
              setUsername(v);
              setLoginFailed(false);
            }}
            placeholder={t("Username")}
            autoFocus
          />
        </PDiv>
        <PDiv>
          <TextInput
            value={password}
            setValue={v => {
              setPassword(v);
              setLoginFailed(false);
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
