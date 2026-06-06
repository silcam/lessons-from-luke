import React from "react";
import { useDispatch } from "react-redux";
import { AppDispatch } from "../../common/state/appState";
import { pushLogout } from "../../common/state/currentUserSlice";
import useTranslation from "../../common/util/useTranslation";
import LanguagesBox from "../languages/LanguagesBox";
import LessonsBox from "../lessons/LessonsBox";
import { StdHeaderBarPage } from "../../common/base-components/HeaderBar";
import Button from "../../common/base-components/Button";

export default function AdminHome() {
  const dispatch = useDispatch<AppDispatch>();
  const logOut = () => dispatch(pushLogout());
  const t = useTranslation();

  return (
    <StdHeaderBarPage
      title={t("Home")}
      renderRight={() => <Button text={t("Log_out")} onClick={logOut} />}
    >
      <LanguagesBox />
      <LessonsBox />
    </StdHeaderBarPage>
  );
}
