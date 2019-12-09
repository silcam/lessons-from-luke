import React from "react";
import { useSelector } from "react-redux";
import { AppState } from "../state/appState";
import { useLoad } from "../../api/RequestContext";
import { loadLanguages, loadTranslatingLanguage } from "../state/languageSlice";

interface IProps {
  code: string;
}

export default function TranslateIndex(props: IProps) {
  const { languages, translating } = useSelector(
    (state: AppState) => state.languages
  );

  useLoad(loadTranslatingLanguage(props.code));

  useLoad(loadLanguages());

  if (!translating) return <h1>"Loading..."</h1>;

  return translating ? (
    <div>
      <h1>Let's translate {translating.name}!</h1>
      <h2>Some Languages!</h2>
      <ul>
        {languages.map(language => (
          <li key={language.languageId}>{language.name}</li>
        ))}
      </ul>
    </div>
  ) : (
    <h1>"Invalid code!"</h1>
  );
}
