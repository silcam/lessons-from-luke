import React from "react";
import { findBy } from "../../../core/util/arrayUtils";
import { TString } from "../../../core/models/TString";
import { LessonTString } from "./useLessonTStrings";
import styled from "styled-components";
import Colors from "../util/Colors";

interface IProps {
  lessonId: number;
  srcLangId: number;
  targetLangId: number;
  docHtml: string;
  lessonTStrings: LessonTString[];
}

export default function DocPreview(props: IProps) {
  const finalHtml = props.lessonTStrings.reduce(
    (html: string, ltStr) =>
      html.replace(
        `##${ltStr.lStr.lessonStringId}##`,
        `<span class="lessonString" id="ls${ltStr.lStr.lessonStringId}">${
          ltStr.lStr.motherTongue && ltStr.tStrs[1]
            ? ltStr.tStrs[1].text
            : ltStr.tStrs[0]?.text || "[...]"
        }</span>`
      ),
    props.docHtml
  );

  return <PreviewDiv dangerouslySetInnerHTML={{ __html: finalHtml }} />;
}

const PreviewDiv = styled.div`
  width: 670px;
  border-left: 1px solid ${Colors.lightGrey};

  .lessonString.selected {
    outline: ${Colors.primary} auto 5px;
  }
`;
