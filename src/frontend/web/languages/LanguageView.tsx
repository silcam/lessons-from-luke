import React from "react";
import { Language } from "../../../core/models/Language";
import Heading from "../../common/base-components/Heading";
import List from "../../common/base-components/List";
import { FlexRow } from "../../common/base-components/Flex";
import { useAppSelector } from "../../common/state/appState";
import { lessonName } from "../../../core/models/Lesson";
import { findBy } from "../../../core/util/arrayUtils";
import ProgressBar from "../../common/base-components/ProgressBar";

interface IProps {
  language: Language;
}

export default function LanguageView(props: IProps) {
  const lessons = useAppSelector(state => state.lessons);
  return (
    <div>
      <Heading text={props.language.name} level={3} />
      <List
        items={props.language.progress.filter(prg => prg.progress > 0)}
        renderItem={progress => (
          <FlexRow>
            <div>
              {lessonName(findBy(lessons, "lessonId", progress.lessonId))}
            </div>
            <ProgressBar percent={progress.progress} />
          </FlexRow>
        )}
      />
    </div>
  );
}
