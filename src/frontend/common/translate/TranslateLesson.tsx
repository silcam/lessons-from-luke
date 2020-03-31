import React, { useState } from "react";
import { Language } from "../../../core/models/Language";
import { useLoad } from "../api/RequestContext";
import { loadTStrings } from "../state/tStringSlice";
import { loadLesson } from "../state/lessonSlice";
import useLessonTStrings from "./useLessonTStrings";
import useTranslation from "../util/useTranslation";
import { useAppSelector } from "../state/appState";
import { SetHdrMessage } from "./TranslateHome";
import { loadDocPreview } from "../state/docPreviewSlice";
import TranslateFallback from "./TranslateFallback";
import TranslateWithPreview from "./TranslateWithPreview";

interface IProps {
  language: Language;
  lessonId: number;
  setHdrMessage: SetHdrMessage;
}

export default function TranslateLesson(props: IProps) {
  const lessonId = props.lessonId;
  const [srcLangId, setSrcLangId] = useState(props.language.defaultSrcLang);

  const { lesson, lessonTStrings } = useLessonTStrings(
    props.lessonId,
    [srcLangId, props.language.languageId],
    { contentOnly: props.language.motherTongue }
  );
  const docHtml: string | undefined = useAppSelector(
    state => state.docPreview[props.lessonId]
  );

  const onDirtyStateChange = (dirty: boolean) =>
    props.setHdrMessage(dirty ? "unsavedChanges" : "changesSaved");

  useLoad(loadLesson(lessonId));
  useLoad(loadTStrings(props.language.languageId, lessonId));
  useLoad(loadTStrings(srcLangId, lessonId), [srcLangId]);
  useLoad(loadDocPreview(lessonId), [lessonId], err => {
    if (err.type == "HTTP" && err.status == 404) return true; // Ignore 404's
    return false;
  });

  return lesson && docHtml ? (
    <TranslateWithPreview
      {...{
        lesson,
        lessonTStrings,
        language: props.language,
        srcLangId,
        setSrcLangId,
        onDirtyStateChange,
        docHtml
      }}
    />
  ) : (
    <TranslateFallback
      {...{
        lesson,
        lessonTStrings,
        language: props.language,
        srcLangId,
        setSrcLangId,
        onDirtyStateChange
      }}
    />
  );
}
