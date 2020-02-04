import React from "react";
import { Switch, Route } from "react-router-dom";
import TranslateIndex from "../../common/translate/TranslateIndex";
import { useAppSelector } from "../../common/state/appState";
import { useLoad } from "../../common/api/RequestContext";
import { loadTranslatingLanguage } from "../../common/state/languageSlice";
import Loading from "../../common/api/Loading";
import { Language } from "../../../core/models/Language";
import { loadLanguageLessons } from "../../common/state/languageLessonSlice";
import TranslateLesson from "../../common/translate/TranslateLesson";

interface IProps {
  code: string;
}

export default function TranslateRoute(props: IProps) {
  const language = useAppSelector(state => state.languages.translating);

  const loading = useLoad(loadTranslatingLanguage(props.code));
  if (loading) return <Loading />;

  return language ? (
    <TranslateLanguage language={language} />
  ) : (
    <p className="error">Invalid code</p>
  );
}

function TranslateLanguage(props: { language: Language }) {
  useLoad(loadLanguageLessons(props.language.languageId));

  const language = props.language;

  return (
    <Switch>
      <Route
        path="/translate/:code/lesson/:lessonVersionId"
        render={({ match }) => (
          <TranslateLesson
            language={language}
            lessonVersionId={match.params.lessonVersionId}
          />
        )}
      />
      <Route render={() => <TranslateIndex language={language} />} />
    </Switch>
  );
}
