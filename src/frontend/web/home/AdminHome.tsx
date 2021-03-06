import React from "react";
import { usePush } from "../../common/api/useLoad";
import { pushLogout } from "../../common/state/currentUserSlice";
import useTranslation from "../../common/util/useTranslation";
import LanguagesBox from "../languages/LanguagesBox";
import LessonsBox from "../lessons/LessonsBox";
import { StdHeaderBarPage } from "../../common/base-components/HeaderBar";
import Button from "../../common/base-components/Button";
import { Link } from "react-router-dom";

export default function AdminHome() {
  const push = usePush();
  const logOut = () => push(pushLogout());
  const t = useTranslation();

  return (
    <StdHeaderBarPage
      title={t("Home")}
      renderRight={() => <Button text={t("Log_out")} onClick={logOut} />}
    >
      <Link to="/migrate">
        <Button text="Migrate Legacy Project" onClick={() => {}} />
      </Link>
      <LanguagesBox />
      <LessonsBox />
    </StdHeaderBarPage>
  );
}
