import React, { useEffect, useState } from "react";
import styled from "styled-components";
import { useDispatch, useSelector } from "react-redux";
import { Navigate, useSearchParams } from "react-router-dom";
import { AppDispatch, AppState } from "../../common/state/appState";
import { pushLogin } from "./authThunks";
import { safeReturnTo } from "./safeReturnTo";
import currentUserSlice from "../../common/state/currentUserSlice";
import Button from "../../common/base-components/Button";
import TextInput from "../../common/base-components/TextInput";
import MiddleOfPage from "../../common/base-components/MiddleOfPage";
import PDiv from "../../common/base-components/PDiv";
import Heading from "../../common/base-components/Heading";
import HandleKey from "../../common/base-components/HandleKey";
import Alert from "../../common/base-components/Alert";
import LoadingSnake from "../../common/base-components/LoadingSnake";
import useTranslation from "../../common/util/useTranslation";
import AppLink from "../common/AppLink";

const CONTACT_EMAIL = "chris_jackson@sil.org";

// The login form is auto-width (MiddleOfPage centers on content); cap the
// banner so the long bilingual copy wraps instead of stretching the page.
const UpgradeNoticeBox = styled(Alert)`
  max-width: 26em;
`;

// Deliberately bilingual and outside the i18n system: this transition notice
// must reach every translator regardless of locale, in both English and French.
function SecurityUpgradeNotice() {
  const contactLink = <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;
  return (
    <UpgradeNoticeBox warning>
      <p>
        Due to necessary software upgrades, we have upgraded the security requirements for access to
        the translation projects. You will need to contact us and we will send you a link to upgrade
        your security credentials to gain access to the app. Please write to {contactLink}.
      </p>
      <p>
        En raison de mises à jour logicielles indispensables, nous avons renforcé les exigences de
        sécurité pour accéder au projet de traduction. Vous devrez nous contacter et nous vous
        enverrons un lien pour mettre à jour vos identifiants de sécurité afin de pouvoir accéder à
        l&apos;application. Veuillez écrire à {contactLink}.
      </p>
    </UpgradeNoticeBox>
  );
}

export default function LoginPage() {
  const t = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const dispatch = useDispatch<AppDispatch>();
  const { user, loaded, error } = useSelector((state: AppState) => state.currentUser);

  const [searchParams] = useSearchParams();
  const hasReturnTo = searchParams.has("returnTo");

  // On redirect-arrival (any ?returnTo present), clear any stale error so a
  // prior failed-login alert does not bleed onto the contextual prompt.
  useEffect(() => {
    if (hasReturnTo && error) {
      dispatch(currentUserSlice.actions.clearError());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!loaded) {
    return <LoadingSnake />;
  }

  if (user) {
    const dest0 = safeReturnTo(searchParams.get("returnTo") ?? "");
    const dest = dest0.startsWith("/login") ? "/" : dest0;
    return <Navigate to={dest} replace />;
  }

  // Any failed-login error present at render time is real: the mount-time
  // effect above already clears a stale error on redirect-arrival, so by the
  // time render sees `error` here it reflects an actual login attempt.
  const loginFailed = Boolean(error);

  const logIn = () => dispatch(pushLogin({ email, password }));

  return (
    <MiddleOfPage>
      <HandleKey onEnter={logIn}>
        <Heading level={1} text="Lessons from Luke" />
        <SecurityUpgradeNotice />
        <Heading level={3} text={t("Log_in")} />
        <PDiv>
          <TextInput
            value={email}
            setValue={(v) => {
              setEmail(v);
            }}
            type="email"
            autoComplete="email"
            inputMode="email"
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
          <Alert warning role="alert" aria-live="assertive">
            {t("Please_sign_in_to_continue")}
          </Alert>
        )}
        {loginFailed && <Alert danger>{t("Log_in_failed")}</Alert>}
        <Button bigger onClick={logIn} text={t("Log_in")} />
      </HandleKey>
      <PDiv>
        <AppLink to="/forgot-password">{t("ForgotPassword_forgot_link")}</AppLink>
      </PDiv>
    </MiddleOfPage>
  );
}
