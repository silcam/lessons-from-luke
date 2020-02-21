import React, { useState } from "react";
import Foldable from "../../common/base-components/Foldable";
import useTranslation from "../../common/util/useTranslation";
import List from "../../common/base-components/List";
import { useAppSelector } from "../../common/state/appState";
import { useLoad } from "../../common/api/RequestContext";
import { loadLanguages } from "../../common/state/languageSlice";
import Button from "../../common/base-components/Button";
import Div from "../../common/base-components/Div";
import AddLanguageForm from "./AddLanguageForm";

export default function LanguagesBox() {
  const t = useTranslation();
  const languages = useAppSelector(state => state.languages.adminLanguages);

  useLoad(loadLanguages(true));

  const [folded, setFolded] = useState(true);
  const [showAddForm, _setShowAddForm] = useState(false);
  const setShowAddForm = (doShow: boolean) => {
    _setShowAddForm(doShow);
    if (doShow) setFolded(false);
  };

  return (
    <Foldable
      folded={folded}
      setFolded={setFolded}
      title={t("Languages")}
      render={folded => (
        <Div>
          {folded ? (
            <div>
              {languages.length} {t("Languages")}
            </div>
          ) : showAddForm ? (
            <AddLanguageForm done={() => setShowAddForm(false)} />
          ) : (
            <List items={languages} renderItem={lang => lang.name} />
          )}
          {!showAddForm && (
            <Button
              onClick={() => setShowAddForm(true)}
              text={t("Add_language")}
              link
            />
          )}
        </Div>
      )}
    />
  );
}
