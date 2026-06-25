// INTERIM PLACEHOLDER — minimal home for a signed-in NON-admin user.
//
// Invitations can now mint non-admin users, but the catch-all route used to
// render AdminHome for any logged-in user. AdminHome's LanguagesBox calls the
// requireAdmin-gated GET /api/admin/languages, which 403s for non-admins. This
// screen exists only so non-admins don't land on the admin home. The real
// standard-user home and role-aware routing arrive in PR #102.
import React from "react";
import { useDispatch } from "react-redux";
import { AppDispatch } from "../../common/state/appState";
import { pushLogout } from "../auth/authThunks";
import useTranslation from "../../common/util/useTranslation";
import { StdHeaderBarPage } from "../../common/base-components/HeaderBar";
import { FlexRow } from "../../common/base-components/Flex";
import Button from "../../common/base-components/Button";
import Div from "../../common/base-components/Div";

export default function SignedInHome() {
  const dispatch = useDispatch<AppDispatch>();
  const logOut = () => dispatch(pushLogout());
  const t = useTranslation();

  return (
    <StdHeaderBarPage
      title={t("Home")}
      renderRight={() => (
        <FlexRow>
          <Button text={t("Log_out")} onClick={logOut} />
        </FlexRow>
      )}
    >
      <Div pad>{t("SignedIn_message")}</Div>
    </StdHeaderBarPage>
  );
}
