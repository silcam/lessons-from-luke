import React, { useState } from "react";
import MiddleOfPage from "../../common/base-components/MiddleOfPage";
import TextInput from "../../common/base-components/TextInput";
import Button from "../../common/base-components/Button";
import Label from "../../common/base-components/Label";
import useTranslation from "../../common/util/useTranslation";
import InterfaceLanguagePicker from "../../common/util/InterfaceLanguagePicker";
import PDiv from "../../common/base-components/PDiv";
import { usePush } from "../../common/api/useLoad";
import { pushCode } from "../../common/state/syncStateSlice";
import Alert from "../../common/base-components/Alert";
import { useAppSelector } from "../../common/state/appState";

export default function SyncCodeForm() {
  const t = useTranslation();
  const push = usePush();
  const connected = useAppSelector(state => state.syncState.connected);

  const [code, _setCode] = useState("");
  const [badCode, setBadCode] = useState(false);
  const setCode = (code: string) => {
    setBadCode(false);
    _setCode(code.toLocaleUpperCase());
  };

  const save = async () => {
    const syncState = await push(pushCode(code));
    if (syncState) {
      if (!syncState.language && syncState.connected) {
        setBadCode(true);
      }
    }
  };

  return (
    <MiddleOfPage>
      <div>
        <PDiv bigger>
          <InterfaceLanguagePicker />
        </PDiv>
        <Label text={t("Enter_your_code")}>
          <TextInput
            value={code}
            setValue={setCode}
            placeholder="ABCDEF"
            bigger
          />
        </Label>
        {badCode && <Alert danger>{t("Code_error_for_desktop")}</Alert>}
        {!connected && <Alert danger>{t("No_connection_check")}</Alert>}
        <Button
          bigger
          text="OK"
          onClick={save}
          disabled={!code || !connected || badCode}
        />
      </div>
    </MiddleOfPage>
  );
}
