import React from "react";
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
      html.replace(`##${ltStr.lStr.lessonStringId}##`, ltStr.tStrs[0]?.text || "[...]"),
    finalHtml
  );
  finalHtml = props.ltStringsForTranslation.reduce(
    (html: string, ltStr, index) =>
      html.replace(
        `##${ltStr.lStr.lessonStringId}##`,
        `<span class="lessonString" id="ls${
          ltStr.lStr.lessonStringId
        }" style="cursor:pointer" data-ls-index="${index}">${escapeHTML(
          ltStr.tStrs[1]?.text || ltStr.tStrs[0]?.text || "[...]"
        )}</span>`
      ),
    finalHtml
  );

  // Stamp the document's CSP nonce onto every LibreOffice <style> element so the
  // production CSP (style-src 'self' 'nonce-…') honors it. On desktop there is no
  // csp-nonce meta and no CSP, so cspNonce is falsy and we leave the HTML untouched.
  const cspNonce = document.querySelector('meta[name="csp-nonce"]')?.getAttribute("content");
  if (cspNonce) {
    finalHtml = finalHtml.replace(/<style(?=[\s>])/gi, `<style nonce="${cspNonce}"`);
  }

  const handlePreviewClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = (e.target as HTMLElement).closest(".lessonString");
    if (el instanceof HTMLElement && el.dataset.lsIndex !== undefined) {
      props.setSelectedIndex(Number(el.dataset.lsIndex));
    }
  };

  return (
    <PreviewDiv onClick={handlePreviewClick} dangerouslySetInnerHTML={{ __html: finalHtml }} />
  );
}

const PreviewDiv = styled.div<React.HTMLAttributes<HTMLDivElement>>`
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
