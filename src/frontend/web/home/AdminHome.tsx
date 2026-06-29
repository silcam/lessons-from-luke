import React from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link } from "react-router-dom";
import { AppDispatch, AppState } from "../../common/state/appState";
import { pushLogout } from "../auth/authThunks";
import useTranslation from "../../common/util/useTranslation";
import LanguagesBox from "../languages/LanguagesBox";
import LessonsBox from "../lessons/LessonsBox";
import { StdHeaderBarPage } from "../../common/base-components/HeaderBar";
import { FlexRow } from "../../common/base-components/Flex";
import Button from "../../common/base-components/Button";

export default function AdminHome() {
  const dispatch = useDispatch<AppDispatch>();
  const logOut = () => dispatch(pushLogout());
  const t = useTranslation();
  const user = useSelector((s: AppState) => s.currentUser.user);

  return (
    <StdHeaderBarPage
      title={t("Home")}
      renderRight={() => (
        <FlexRow>
          {user?.admin && (
            <Link to="/admin/invitations">
              <Button text={t("Invitations_page_heading")} onClick={() => {}} />
            </Link>
          )}
          <Button text={t("Log_out")} onClick={logOut} />
        </FlexRow>
      )}
    >
      <LanguagesBox />
      <LessonsBox />
    </StdHeaderBarPage>
  );
}
