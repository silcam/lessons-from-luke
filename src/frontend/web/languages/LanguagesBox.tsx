import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Foldable from "../../common/base-components/Foldable";
import useTranslation from "../../common/util/useTranslation";
import List from "../../common/base-components/List";
import { useAppSelector } from "../../common/state/appState";
import { useLoad } from "../../common/api/useLoad";
import { loadLanguages } from "../../common/state/languageSlice";
import Button from "../../common/base-components/Button";
import Div from "../../common/base-components/Div";
import AddLanguageForm from "./AddLanguageForm";
import { totalProgress } from "../../../core/models/Language";
import { findBy } from "../../../core/util/arrayUtils";
import LanguageView from "./LanguageView";
import LoadingSnake from "../../common/base-components/LoadingSnake";

export default function LanguagesBox() {
  const t = useTranslation();
  const navigate = useNavigate();
  const { languageId: languageIdParam } = useParams<{ languageId?: string }>();
  const languages = useAppSelector((state) => state.languages.adminLanguages);

  const loading = useLoad(loadLanguages(true));

  const [folded, setFolded] = useState(false);
  const [showAddForm, _setShowAddForm] = useState(false);
  const setShowAddForm = (doShow: boolean) => {
    _setShowAddForm(doShow);
    if (doShow) setFolded(false);
  };

  const languageId = languageIdParam ? parseInt(languageIdParam, 10) : undefined;
  const selectedLanguage =
    languageId !== undefined ? findBy(languages, "languageId", languageId) : undefined;

  const notFound = !loading && languageId !== undefined && !selectedLanguage;

  useEffect(() => {
    if (notFound) navigate("/", { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notFound]);

  if (loading || notFound) {
    return <LoadingSnake />;
  }

  return (
    <Foldable
      folded={selectedLanguage ? false : folded}
      setFolded={setFolded}
      title={t("Languages")}
      render={(folded) => (
        <Div>
          {selectedLanguage ? (
            <LanguageView language={selectedLanguage} done={() => navigate("/")} />
          ) : folded ? (
            <div>
              {languages.length} {t("Languages")}
            </div>
          ) : showAddForm ? (
            <AddLanguageForm done={() => setShowAddForm(false)} />
          ) : (
            <React.Fragment>
              <Button onClick={() => setShowAddForm(true)} text={t("Add_language")} />
              <List
                items={languages}
                noBorders
                renderItem={(lang) => (
                  <div>
                    <Button
                      link
                      text={lang.name}
                      onClick={() => navigate(`/languages/${lang.languageId}`)}
                    />
                    {` ${totalProgress(lang.progress)}%`}
                  </div>
                )}
              />
            </React.Fragment>
          )}
        </Div>
      )}
    />
  );
}
