import React from "react";
import useTranslation from "../../common/util/useTranslation";
import { useAppSelector } from "../../common/state/appState";
import { StdHeaderBarPage } from "../../common/base-components/HeaderBar";
import Heading from "../../common/base-components/Heading";
import List from "../../common/base-components/List";
import Div from "../../common/base-components/Div";
import { Redirect } from "react-router-dom";

export default function UsfmImportResultPage() {
  const t = useTranslation();
  const usfmImportResult = useAppSelector(
    state => state.languages.usfmImportResult
  );

  if (!usfmImportResult) {
    console.log("No USFM Import Result");
    return <Redirect to="/" />;
  }

  const { language, tStrings, errors } = usfmImportResult;

  return (
    <StdHeaderBarPage title={t("X_scripture", { language: language.name })}>
      <Div pad>
        {errors.length > 0 && (
          <div>
            <Heading level={3} text={t("Errors")} />
            <List items={errors} renderItem={error => error} />
          </div>
        )}
        <div>
          <Heading level={3} text={t("Imported_texts")} />
          <List items={tStrings} renderItem={tString => tString.text} />
        </div>
      </Div>
    </StdHeaderBarPage>
  );
}
