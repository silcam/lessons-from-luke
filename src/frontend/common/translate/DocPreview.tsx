import React, { useEffect } from "react";
import { LessonTString } from "./useLessonTStrings";
import styled from "styled-components";
import Colors from "../util/Colors";
import { escapeHTML } from "../../../core/util/stringUtils";

interface IProps {
  lessonId: number;
  srcLangId: number;
  targetLangId: number;
  docHtml: string;
  ltStringsForTranslation: LessonTString[];
  otherLTStrings: LessonTString[];
  setSelectedIndex: (index: number) => void;
}

export default function DocPreview(props: IProps) {
  let finalHtml = preprocessHtml(props.docHtml);
  finalHtml = props.otherLTStrings.reduce(
    (html: string, ltStr) =>
      html.replace(
        `##${ltStr.lStr.lessonStringId}##`,
        ltStr.tStrs[0]?.text || "[...]"
      ),
    finalHtml
  );
  finalHtml = props.ltStringsForTranslation.reduce(
    (html: string, ltStr, index) =>
      html.replace(
        `##${ltStr.lStr.lessonStringId}##`,
        `<span class="lessonString" id="ls${
          ltStr.lStr.lessonStringId
        }" style="cursor:pointer" onclick="window.setSelectedLessonString(${index})">${escapeHTML(
          ltStr.tStrs[1]?.text || ltStr.tStrs[0]?.text || "[...]"
        )}</span>`
      ),
    finalHtml
  );

  useEffect(() => {
    (window as any).setSelectedLessonString = (index: number) => {
      props.setSelectedIndex(index);
    };
    return () => {
      (window as any).setSelectedLessonString = () => {};
    };
  });

  return <PreviewDiv dangerouslySetInnerHTML={{ __html: finalHtml }} />;
}

const PreviewDiv = styled.div`
  width: min-content;
  min-width: 660px;
  padding: 12px;
  border-left: 1px solid ${Colors.lightGrey};

  .lessonString.selected {
    outline: ${Colors.primary} auto 5px;
  }
`;

function preprocessHtml(html: string) {
  return html.replace(/<meta.*?>/g, "").replace("position: absolute", "");
}
